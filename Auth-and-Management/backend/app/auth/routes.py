"""
Auth blueprint routes.

Endpoints:
  GET  /api/auth/google               → Initiate Google OAuth 2.0 flow
  GET  /api/auth/google/callback      → Handle OAuth callback from Google
  GET  /api/auth/me                   → Return current user info (JWT required)
  POST /api/auth/verify-otp           → Verify 6-digit OTP (JWT required)
  POST /api/auth/resend-otp           → Resend OTP email (rate-limited)
  POST /api/auth/refresh              → Issue new access token via refresh cookie
  POST /api/auth/logout               → Revoke current token + clear cookies

OAuth flow (Vite proxy approach):
  1. React navigates window.location → /api/auth/google (Vite proxies to Flask)
  2. Flask redirects browser → Google
  3. Google redirects → /api/auth/google/callback (Vite proxies to Flask)
  4. Flask issues JWT cookies, redirects → React /auth/callback
  5. React calls GET /api/auth/me to hydrate state
"""
from datetime import datetime

from flask import (
    current_app,
    jsonify,
    make_response,
    redirect,
    request,
)
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    get_jwt,
    get_jwt_identity,
    jwt_required,
    set_access_cookies,
    set_refresh_cookies,
    unset_jwt_cookies,
)

from . import auth_bp
from .utils import (
    generate_otp,
    roles_required,  # noqa: F401  (re-exported for convenience)
    send_verification_email,
    verified_required,  # noqa: F401
    verify_otp,
)
from ..extensions import db, limiter, oauth
from ..models.token_blacklist import TokenBlocklist
from ..models.user import Role, User


# ── Helper ────────────────────────────────────────────────────────────────────

def _make_jwt_response(user: User, *, redirect_url: str | None = None):
    """
    Issue JWT access + refresh cookies for *user*.
    If redirect_url is given, return a redirect response with cookies set;
    otherwise return a JSON response.
    """
    additional_claims = {
        "roles": [r.name for r in user.roles],
        "is_verified": user.is_verified,
        "otp_verified": False,
        "email": user.email,
        "name": user.name,
    }
    access_token  = create_access_token(identity=user.id, additional_claims=additional_claims)
    refresh_token = create_refresh_token(
        identity=user.id,
        additional_claims={"otp_verified": False}
    )

    if redirect_url:
        resp = make_response(redirect(redirect_url))
    else:
        resp = make_response(jsonify({"user": user.to_dict()}))

    set_access_cookies(resp, access_token)
    set_refresh_cookies(resp, refresh_token)
    return resp


# ── Google OAuth ──────────────────────────────────────────────────────────────

@auth_bp.route("/google")
def google_login():
    """Redirect browser to Google's OAuth consent screen."""
    redirect_uri = current_app.config["OAUTH_REDIRECT_URI"]
    return oauth.google.authorize_redirect(redirect_uri)


@auth_bp.route("/google/callback")
def google_callback():
    """
    Handle the OAuth 2.0 callback from Google.
    Creates or updates the user record, sends OTP if not yet verified,
    then drops JWT cookies and redirects to the React SPA.
    """
    frontend_url = current_app.config["FRONTEND_URL"]

    try:
        token     = oauth.google.authorize_access_token()
        user_info = token.get("userinfo") or oauth.google.userinfo()

        google_id  = user_info["sub"]
        email      = user_info["email"]
        name       = user_info.get("name") or email.split("@")[0]
        avatar_url = user_info.get("picture")

        # ── Find or create user ───────────────────────────────────────────────
        user: User | None = User.query.filter(
            (User.google_id == google_id) | (User.email == email)
        ).first()

        is_new = False
        if user is None:
            is_new = True
            default_role = Role.query.filter_by(name=Role.CLUB_MEMBER).first()
            user = User(
                google_id=google_id,
                email=email,
                name=name,
                avatar_url=avatar_url,
                is_verified=False,
                is_active=True,
            )
            if default_role:
                user.roles.append(default_role)
            db.session.add(user)
            db.session.flush()   # get user.id without full commit yet
        else:
            # Link Google account if only email matched previously
            if not user.google_id:
                user.google_id = google_id
            # Always refresh avatar from Google
            user.avatar_url = avatar_url

        db.session.commit()

        if not user.is_active:
            return redirect(f"{frontend_url}/login?error=account_deactivated")
         
        # Always send OTP on every login
        otp = generate_otp(user.id)
        ok = send_verification_email(user, otp)
        if not ok:
            current_app.logger.warning(
                "Email send failed for %s (user_id=%s) — OTP: %s",
                user.email, user.id, otp
            )

        # ── Build redirect URL ────────────────────────────────────────────────
        redirect_url = f"{frontend_url}/auth/callback?status=pending_verification"

        return _make_jwt_response(user, redirect_url=redirect_url)

    except Exception as exc:
        return f"ERROR: {str(exc)}", 500

# ── Login via Registration Number ─────────────────────────────────────────────

@auth_bp.route("/request-otp", methods=["POST"])
@limiter.limit("5 per minute")
def request_otp_by_reg():
    """
    Request an OTP using a registration number instead of Google OAuth.
    Returns a short-lived JWT session for the OTP verification step.
    """
    data = request.get_json(silent=True) or {}
    reg_no = data.get("registration_number", "").strip()
    
    if not reg_no:
        return jsonify({"error": "Registration number is required"}), 400
        
    user = User.query.filter_by(registration_number=reg_no).first()
    if not user:
        return jsonify({"error": "Account not found. Please sign up with Google first."}), 404
        
    if not user.is_active:
        return jsonify({"error": "Account deactivated."}), 403
        
    if not user.is_approved:
        return jsonify({"error": "Your account is pending admin approval."}), 403
        
    otp = generate_otp(user.id)
    ok = send_verification_email(user, otp)
    
    if not ok:
        current_app.logger.warning("Email send failed for %s (user_id=%s) — OTP: %s", user.email, user.id, otp)
        return jsonify({"error": "Failed to send OTP to your email."}), 500
        
    return _make_jwt_response(user)


# ── Complete Onboarding ───────────────────────────────────────────────────────

@auth_bp.route("/complete-onboarding", methods=["POST"])
@jwt_required()
def complete_onboarding():
    """Submit registration details for a newly created user."""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    
    if not user:
        return jsonify({"error": "User not found"}), 404
        
    if user.registration_number:
        return jsonify({"error": "Onboarding already completed."}), 400
        
    data = request.get_json(silent=True) or {}
    reg_no = data.get("registration_number", "").strip()
    year = data.get("year", "").strip()
    dept = data.get("department", "").strip()
    section = data.get("section", "").strip()
    name = data.get("name", "").strip()
    
    if not all([reg_no, year, dept, section, name]):
        return jsonify({"error": "All fields are required"}), 400
        
    # Check if reg_no already exists
    existing = User.query.filter_by(registration_number=reg_no).first()
    if existing and existing.id != user.id:
        return jsonify({"error": "Registration number already in use"}), 400
        
    user.name = name
    user.registration_number = reg_no
    user.year = year
    user.department = dept
    user.section = section
    user.is_approved = False  # explicitly pending approval
    
    db.session.commit()
    
    return jsonify({"message": "Onboarding completed. Pending approval.", "user": user.to_dict()}), 200



# ── /me ───────────────────────────────────────────────────────────────────────

@auth_bp.route("/me")
@jwt_required()
def get_me():
    """Return current authenticated user info."""

    user_id = get_jwt_identity()
    claims = get_jwt()

    user = User.query.get(user_id)

    if not user:
        return jsonify({"error": "User not found"}), 404

    data = user.to_dict()

    # Add session OTP status from JWT
    data["login_verified"] = claims.get("otp_verified", False)

    return jsonify({"user": data}), 200

# ── OTP Verification ──────────────────────────────────────────────────────────

@auth_bp.route("/verify-otp", methods=["POST"])
@jwt_required()
@limiter.limit("10 per hour")
def verify_email_otp():
    """
    Verify a 6-digit OTP.  On success marks the user as verified and
    re-issues the access cookie with updated claims.
    """
    user_id = get_jwt_identity()
    data    = request.get_json(silent=True) or {}

    otp_text = str(data.get("otp", "")).strip()
    if len(otp_text) != 6 or not otp_text.isdigit():
        return jsonify({"error": "OTP must be exactly 6 digits"}), 400

    success, message = verify_otp(user_id, otp_text)
    if not success:
        return jsonify({"error": message}), 400

    user = User.query.get(user_id)
    user.is_verified = True
    db.session.commit()

# Re-issue tokens after OTP success
    additional_claims = {
        "roles": [r.name for r in user.roles],
        "is_verified": True,
        "otp_verified": True,
        "email": user.email,
        "name": user.name,
    }

    access_token = create_access_token(
        identity=user.id,
        additional_claims=additional_claims
    )

    refresh_token = create_refresh_token(
        identity=user.id,
        additional_claims={"otp_verified": True}
    )

    resp = make_response(jsonify({
        "message": "OTP verified successfully",
        "user": user.to_dict()
    }))

    set_access_cookies(resp, access_token)
    set_refresh_cookies(resp, refresh_token)

    return resp, 200


# ── Resend OTP ────────────────────────────────────────────────────────────────

@auth_bp.route("/resend-otp", methods=["POST"])
@jwt_required()
@limiter.limit("3 per hour")
def resend_otp():
    """Resend OTP for current login session."""
    
    user_id = get_jwt_identity()
    user = User.query.get(user_id)

    if not user:
        return jsonify({"error": "User not found"}), 404

    # Always resend OTP
    otp = generate_otp(user.id)
    ok = send_verification_email(user, otp)

    if not ok:
        return jsonify({"error": "Failed to send email. Please try again later."}), 500

    return jsonify({"message": f"OTP sent to {user.email}"}), 200


# ── Token Refresh ─────────────────────────────────────────────────────────────

@auth_bp.route("/refresh", methods=["POST"])
@jwt_required(refresh=True)
def refresh_token():
    """
    Exchange a valid refresh cookie for a new short-lived access cookie.
    The refresh cookie itself is left intact.
    """
    user_id = get_jwt_identity()
    user: User | None = User.query.get(user_id)

    if not user or not user.is_active:
        return jsonify({"error": "Unauthorized"}), 401

    claims = get_jwt()
    additional_claims = {
        "roles": [r.name for r in user.roles],
        "is_verified": user.is_verified,
        "otp_verified": claims.get("otp_verified", False),
        "email": user.email,
        "name": user.name,
    }
    access_token = create_access_token(identity=user.id, additional_claims=additional_claims)

    resp = make_response(jsonify({"message": "Token refreshed successfully"}))
    set_access_cookies(resp, access_token)
    return resp, 200


# ── Logout ────────────────────────────────────────────────────────────────────

@auth_bp.route("/logout", methods=["POST"])
@jwt_required(verify_type=False)
def logout():
    """
    Revoke the current JWT by storing its JTI in the blocklist,
    then clear all JWT cookies from the browser.
    """
    jwt_data = get_jwt()
    entry    = TokenBlocklist(jti=jwt_data["jti"], token_type=jwt_data["type"])
    db.session.add(entry)
    db.session.commit()

    resp = make_response(jsonify({"message": "Logged out successfully"}))
    unset_jwt_cookies(resp)
    return resp, 200
