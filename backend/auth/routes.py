import random
import string
import html
import bcrypt
from datetime import datetime, timedelta, timezone

from flask import Blueprint, request, jsonify, session, current_app, redirect, make_response
from flask_mail import Mail, Message
from flask_jwt_extended import (
    create_access_token, create_refresh_token,
    get_jwt, get_jwt_identity, jwt_required,
    set_access_cookies, set_refresh_cookies, unset_jwt_cookies,
)
from authlib.integrations.flask_client import OAuth

from db import execute_query
from config import Config

auth_bp = Blueprint("auth", __name__)
oauth   = OAuth()


def init_oauth(app):
    oauth.init_app(app)
    oauth.register(
        name="google",
        client_id=Config.GOOGLE_CLIENT_ID,
        client_secret=Config.GOOGLE_CLIENT_SECRET,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile", "prompt": "select_account"},
    )


# ── OTP helpers (legacy raw-SQL users table) ──────────────────────────────────

def _generate_otp(user_id):
    otp    = "".join(random.choices(string.digits, k=6))
    hashed = bcrypt.hashpw(otp.encode(), bcrypt.gensalt()).decode()
    expiry = datetime.now(timezone.utc) + timedelta(minutes=5)
    execute_query("UPDATE users SET otp=%s, otp_expiry=%s WHERE id=%s", (hashed, expiry, user_id))
    return otp


def _verify_otp_value(user_id, otp_text):
    rows = execute_query("SELECT otp, otp_expiry FROM users WHERE id=%s", (user_id,), fetch=True)
    if not rows:
        return False, "User not found."
    user = rows[0]
    if not user["otp"]:
        return False, "No active OTP found. Please request a new one."
    if datetime.now(timezone.utc) > user["otp_expiry"].replace(tzinfo=timezone.utc):
        return False, "OTP has expired. Please request a new one."
    if not bcrypt.checkpw(otp_text.encode(), user["otp"].encode()):
        return False, "Invalid OTP. Please try again."
    return True, "OTP verified successfully."


def _send_otp_mail(email, name, otp):
    mail_obj = Mail(current_app._get_current_object())
    digits_html = f"<div style='font-size:28px;letter-spacing:2px;font-weight:bold;'>{' '.join(otp)}</div>"
    html_body = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#07070f;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#07070f,#0f0f1a);min-height:100vh;">
    <tr><td align="center" style="padding:48px 16px;">
      <table width="520" cellpadding="0" cellspacing="0"
             style="background:rgba(255,255,255,0.05);border-radius:20px;border:1px solid rgba(139,92,246,0.25);">
        <tr><td style="padding:40px 40px 0;text-align:center;">
          <h1 style="margin:0;font-size:22px;color:#f1f5f9;">QR Attendance System</h1>
          <p style="color:#8b5cf6;font-size:14px;">EMAIL VERIFICATION</p>
        </td></tr>
        <tr><td style="padding:32px 40px;">
          <p style="color:#94a3b8;font-size:16px;">Hi <strong style="color:#e9d5ff;">{html.escape(name)}</strong>,</p>
          <p style="color:#94a3b8;font-size:16px;">Use the one-time passcode below to verify your email.</p>
          <div style="text-align:center;padding:28px 20px;background:rgba(139,92,246,0.08);border-radius:14px;border:1px solid rgba(139,92,246,0.2);margin-bottom:24px;">
            {digits_html}
            <p style="margin:16px 0 0;color:#64748b;font-size:13px;">⏱ Valid for <strong style="color:#a78bfa;">5 minutes</strong></p>
          </div>
        </td></tr>
        <tr><td style="padding:0 40px 36px;border-top:1px solid rgba(255,255,255,0.06);">
          <p style="color:#475569;font-size:12px;text-align:center;margin:24px 0 0;">QR Attendance System &bull; Automated message, do not reply</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""
    msg = Message(subject="🔐 Verify Your Email — QR Attendance", recipients=[email], html=html_body)
    mail_obj.send(msg)


# ── JWT helpers ───────────────────────────────────────────────────────────────

def _make_tokens(user, otp_verified=False):
    additional_claims = {
        "role":        user["role"],
        "is_verified": bool(user["is_verified"]),
        "otp_verified": otp_verified,
        "email":       user["email"],
        "name":        user["name"],
    }
    access_token  = create_access_token(identity=str(user["id"]), additional_claims=additional_claims)
    refresh_token = create_refresh_token(identity=str(user["id"]), additional_claims={"otp_verified": otp_verified})
    return access_token, refresh_token


def _set_cookie_response(user, otp_verified=False, redirect_url=None):
    """Issue JWT cookies. Returns a redirect or JSON response."""
    access_token, refresh_token = _make_tokens(user, otp_verified)
    if redirect_url:
        resp = make_response(redirect(redirect_url))
    else:
        resp = make_response(jsonify({"user": _user_to_dict(user)}))
    set_access_cookies(resp, access_token)
    set_refresh_cookies(resp, refresh_token)
    return resp


def _user_to_dict(user):
    return {
        "id":           user["id"],
        "name":         user["name"],
        "email":        user["email"],
        "role":         user["role"],
        "department":   user.get("department"),
        "year":         user.get("year"),
        "regno":        user.get("regno"),
        "is_verified":  bool(user.get("is_verified")),
        "is_approved":  bool(user.get("is_approved")),
        "face_registered": bool(user.get("face_registered")),
        "google_id":    user.get("google_id"),
    }


# ── Google OAuth ──────────────────────────────────────────────────────────────

@auth_bp.route("/google")
def google_login():
    import secrets
    state = secrets.token_urlsafe(16)
    session['oauth_state'] = state
    session.modified = True
    from urllib.parse import urlencode
    params = {
        'client_id':     Config.GOOGLE_CLIENT_ID,
        'redirect_uri':  Config.OAUTH_REDIRECT_URI,
        'response_type': 'code',
        'scope':         'openid email profile',
        'state':         state,
        'prompt':        'select_account',
    }
    return redirect('https://accounts.google.com/o/oauth2/v2/auth?' + urlencode(params))


@auth_bp.route("/google/callback")
def google_callback():
    import requests as http_req
    frontend_url = Config.FRONTEND_URL
    try:
        code = request.args.get('code')
        if not code:
            raise ValueError('No code in callback')

        token_resp = http_req.post('https://oauth2.googleapis.com/token', data={
            'code':          code,
            'client_id':     Config.GOOGLE_CLIENT_ID,
            'client_secret': Config.GOOGLE_CLIENT_SECRET,
            'redirect_uri':  Config.OAUTH_REDIRECT_URI,
            'grant_type':    'authorization_code',
        })
        token_data = token_resp.json()
        if 'error' in token_data:
            error_desc = token_data.get('error_description', '')
            current_app.logger.error(
                "Google token exchange failed. Error: %s, Description: %s, Redirect URI used: %s", 
                token_data['error'], error_desc, Config.OAUTH_REDIRECT_URI
            )
            raise ValueError(f"{token_data['error']}: {error_desc}")

        userinfo_resp = http_req.get(
            'https://www.googleapis.com/oauth2/v3/userinfo',
            headers={'Authorization': f'Bearer {token_data["access_token"]}'}
        )
        user_info  = userinfo_resp.json()
        google_id  = user_info['sub']
        email      = user_info['email']
        name       = user_info.get('name') or email.split('@')[0]
        avatar_url = user_info.get('picture')

        ADMIN_EMAILS = {"s.satvika2005@gmail.com"}
        is_admin_email = email in ADMIN_EMAILS

        rows = execute_query("SELECT * FROM users WHERE google_id=%s OR email=%s", (google_id, email), fetch=True)
        if rows:
            user = rows[0]
            if not user["google_id"]:
                execute_query("UPDATE users SET google_id=%s WHERE id=%s", (google_id, user["id"]))
            if is_admin_email and user["role"] != "admin":
                execute_query("UPDATE users SET role='admin', is_approved=TRUE, is_verified=TRUE WHERE id=%s", (user["id"],))
            user = execute_query("SELECT * FROM users WHERE id=%s", (user["id"],), fetch=True)[0]
        else:
            role = "admin" if is_admin_email else "member"
            approved = True if is_admin_email else False
            user_id = execute_query(
                "INSERT INTO users (name, email, google_id, role, is_verified, is_approved) VALUES (%s,%s,%s,%s,%s,%s)",
                (name, email, google_id, role, is_admin_email, approved)
            )
            user = execute_query("SELECT * FROM users WHERE id=%s", (user_id,), fetch=True)[0]

        otp = _generate_otp(user["id"])
        try:
            _send_otp_mail(user["email"], user["name"], otp)
        except Exception as e:
            current_app.logger.warning("Email send failed for %s: %s", user["email"], e)

        redirect_url = f"{frontend_url}/auth/callback?status=pending_verification"
        return _set_cookie_response(user, otp_verified=False, redirect_url=redirect_url)

    except Exception as exc:
        current_app.logger.error("Google callback error: %s", exc)
        return redirect(f"{frontend_url}/login?error=auth_failed")


# ── Login via Registration Number ─────────────────────────────────────────────

@auth_bp.route("/request-otp", methods=["POST"])
def request_otp_by_reg():
    data   = request.get_json(silent=True) or {}
    reg_no = data.get("registration_number", "").strip()
    if not reg_no:
        return jsonify({"error": "Registration number is required"}), 400

    rows = execute_query("SELECT * FROM users WHERE regno=%s", (reg_no,), fetch=True)
    if not rows:
        return jsonify({"error": "Account not found. Please sign up with Google first."}), 404
    user = rows[0]

    if not user.get("is_approved"):
        return jsonify({"error": "Your account is pending admin approval."}), 403

    otp = _generate_otp(user["id"])
    try:
        _send_otp_mail(user["email"], user["name"], otp)
    except Exception as e:
        current_app.logger.warning("Email send failed for %s: %s", user["email"], e)
        return jsonify({"error": "Failed to send OTP to your email."}), 500

    return _set_cookie_response(user, otp_verified=False)


# ── Complete Onboarding ───────────────────────────────────────────────────────

@auth_bp.route("/complete-onboarding", methods=["POST", "OPTIONS"])
@jwt_required()
def complete_onboarding():
    if request.method == "OPTIONS":
        return jsonify({}), 200
    user_id = get_jwt_identity()
    data    = request.get_json(silent=True) or {}

    name       = data.get("name", "").strip()
    regno      = data.get("registration_number", "").strip()
    year       = data.get("year", "").strip()
    department = data.get("department", "").strip()
    section    = data.get("section", "").strip()
    role       = data.get("role", "member").strip()

    valid_roles = {"member", "domain_lead", "president", "vice_president"}
    if role not in valid_roles:
        role = "member"

    if not all([name, regno, year, department, section]):
        return jsonify({"error": "All fields are required"}), 400

    existing = execute_query("SELECT id FROM users WHERE regno=%s AND id != %s", (regno, user_id), fetch=True)
    if existing:
        return jsonify({"error": "Registration number already in use"}), 400

    execute_query(
        "UPDATE users SET name=%s, regno=%s, year=%s, department=%s, role=%s, is_approved=FALSE WHERE id=%s",
        (name, regno, year, department, role, user_id)
    )

    user = execute_query("SELECT * FROM users WHERE id=%s", (user_id,), fetch=True)[0]
    return jsonify({"message": "Onboarding completed. Pending approval.", "user": _user_to_dict(user)}), 200


# ── /me ───────────────────────────────────────────────────────────────────────

@auth_bp.route("/me")
@jwt_required()
def get_me():
    user_id = get_jwt_identity()
    claims  = get_jwt()
    rows    = execute_query(
        "SELECT id, name, email, role, department, year, regno, is_verified, face_registered, google_id, is_approved FROM users WHERE id=%s",
        (user_id,), fetch=True
    )
    if not rows:
        return jsonify({"error": "User not found"}), 404
    user = rows[0]
    user["login_verified"]      = claims.get("otp_verified", False)
    user["registration_number"] = user.get("regno")
    # Expose role as both legacy string and new roles array
    user["roles"] = [user["role"]] if user.get("role") else []
    user["is_active"]   = True
    user["avatar_url"]  = user.get("avatar_url") or None
    user["section"]     = user.get("section") or None
    if user["role"] == "domain_lead":
        user["led_domains"] = execute_query(
            "SELECT d.id, d.name FROM domains d JOIN domain_leads dl ON d.id=dl.domain_id WHERE dl.user_id=%s",
            (user_id,), fetch=True
        ) or []
    else:
        user["led_domains"] = []
    user["domains"] = execute_query(
        "SELECT d.id, d.name FROM domains d JOIN user_domains ud ON d.id=ud.domain_id WHERE ud.user_id=%s",
        (user_id,), fetch=True
    ) or []
    return jsonify({"user": user}), 200


# ── OTP Verify ────────────────────────────────────────────────────────────────

@auth_bp.route("/verify-otp", methods=["POST"])
@jwt_required()
def verify_email_otp():
    user_id  = get_jwt_identity()
    data     = request.get_json(silent=True) or {}
    otp_text = str(data.get("otp", "")).strip()

    if len(otp_text) != 6 or not otp_text.isdigit():
        return jsonify({"error": "OTP must be exactly 6 digits"}), 400

    success, message = _verify_otp_value(user_id, otp_text)
    if not success:
        return jsonify({"error": message}), 400

    execute_query("UPDATE users SET is_verified=TRUE, otp=NULL, otp_expiry=NULL WHERE id=%s", (user_id,))
    user = execute_query("SELECT * FROM users WHERE id=%s", (user_id,), fetch=True)[0]

    resp = make_response(jsonify({"message": "OTP verified successfully", "user": _user_to_dict(user)}))
    access_token, refresh_token = _make_tokens(user, otp_verified=True)
    set_access_cookies(resp, access_token)
    set_refresh_cookies(resp, refresh_token)
    return resp, 200


# ── Resend OTP ────────────────────────────────────────────────────────────────

@auth_bp.route("/resend-otp", methods=["POST"])
@jwt_required()
def resend_otp():
    user_id = get_jwt_identity()
    rows    = execute_query("SELECT email, name FROM users WHERE id=%s", (user_id,), fetch=True)
    if not rows:
        return jsonify({"error": "User not found"}), 404
    user = rows[0]
    otp  = _generate_otp(user_id)
    try:
        _send_otp_mail(user["email"], user["name"], otp)
    except Exception:
        return jsonify({"error": "Failed to send email. Please try again later."}), 500
    return jsonify({"message": f"OTP sent to {user['email']}"}), 200


# ── Token Refresh ─────────────────────────────────────────────────────────────

@auth_bp.route("/refresh", methods=["POST"])
@jwt_required(refresh=True)
def refresh_token():
    user_id = get_jwt_identity()
    rows    = execute_query("SELECT * FROM users WHERE id=%s", (user_id,), fetch=True)
    if not rows:
        return jsonify({"error": "Unauthorized"}), 401
    user   = rows[0]
    claims = get_jwt()
    access_token, _ = _make_tokens(user, otp_verified=claims.get("otp_verified", False))
    resp = make_response(jsonify({"message": "Token refreshed successfully"}))
    set_access_cookies(resp, access_token)
    return resp, 200


# ── Logout ────────────────────────────────────────────────────────────────────

@auth_bp.route("/logout", methods=["POST"])
@jwt_required(verify_type=False)
def logout():
    # Optionally blocklist the token via the new TokenBlocklist model
    try:
        from extensions import db
        from models.token_blacklist import TokenBlocklist
        jwt_data = get_jwt()
        db.session.add(TokenBlocklist(jti=jwt_data["jti"], token_type=jwt_data["type"]))
        db.session.commit()
    except Exception:
        pass

    session.clear()
    resp = make_response(jsonify({"message": "Logged out successfully"}))
    unset_jwt_cookies(resp)
    return resp, 200


# ── Profile GET ───────────────────────────────────────────────────────────────

@auth_bp.route("/profile", methods=["GET"])
@jwt_required()
def get_profile():
    user_id = get_jwt_identity()
    rows    = execute_query(
        "SELECT id, name, email, role, department, year, regno, is_verified, is_approved, face_registered FROM users WHERE id=%s",
        (user_id,), fetch=True
    )
    if not rows:
        return jsonify({"error": "Not found"}), 404
    user = rows[0]
    user["domains"] = execute_query(
        "SELECT d.id, d.name FROM domains d JOIN user_domains ud ON d.id=ud.domain_id WHERE ud.user_id=%s",
        (user_id,), fetch=True
    ) or []
    if user["role"] == "domain_lead":
        lead = execute_query("SELECT domain_id FROM domain_leads WHERE user_id=%s", (user_id,), fetch=True)
        user["lead_domain_id"] = lead[0]["domain_id"] if lead else None
    return jsonify(user)


# ── Profile PUT ───────────────────────────────────────────────────────────────

@auth_bp.route("/profile", methods=["PUT"])
@jwt_required()
def update_profile():
    user_id  = get_jwt_identity()
    data     = request.json
    new_regno = data.get("regno", "").strip()
    if new_regno:
        existing = execute_query("SELECT id FROM users WHERE regno=%s AND id != %s", (new_regno, user_id), fetch=True)
        if existing:
            return jsonify({"error": "Register number already in use by another account."}), 409
    execute_query(
        "UPDATE users SET name=%s, department=%s, year=%s, regno=%s WHERE id=%s",
        (data.get("name"), data.get("department"), data.get("year"), new_regno, user_id)
    )
    # Domain changes go through pending requests — not direct insert
    for did in data.get("domain_ids", []):
        existing = execute_query("SELECT 1 FROM user_domains WHERE user_id=%s AND domain_id=%s", (user_id, did), fetch=True)
        if not existing:
            execute_query(
                "INSERT IGNORE INTO domain_join_requests (user_id, domain_id, status) VALUES (%s,%s,'pending')",
                (user_id, did)
            )
    return jsonify({"message": "Profile updated"})


# ── Admin: Approve User ───────────────────────────────────────────────────────

@auth_bp.route("/approve-user/<int:target_id>", methods=["POST"])
@jwt_required()
def approve_user(target_id):
    user_id = get_jwt_identity()
    rows = execute_query("SELECT role FROM users WHERE id=%s", (user_id,), fetch=True)
    role = rows[0]["role"] if rows else None
    if role not in ("admin", "faculty"):
        return jsonify({"error": "Access denied"}), 403
    execute_query("UPDATE users SET is_approved=TRUE WHERE id=%s", (target_id,))
    return jsonify({"message": "User approved"}), 200


@auth_bp.route("/pending-users", methods=["GET"])
@jwt_required()
def pending_users():
    user_id = get_jwt_identity()
    rows = execute_query("SELECT role FROM users WHERE id=%s", (user_id,), fetch=True)
    role = rows[0]["role"] if rows else None
    if role not in ("admin", "faculty"):
        return jsonify({"error": "Access denied"}), 403
    rows = execute_query(
        "SELECT id, name, email, role, department, year, regno FROM users WHERE is_approved=FALSE AND regno IS NOT NULL ORDER BY id DESC",
        fetch=True
    )
    return jsonify(rows), 200


# ── Assign Domain Lead ────────────────────────────────────────────────────────

@auth_bp.route("/assign-domain-lead", methods=["POST"])
@jwt_required()
def assign_domain_lead():
    user_id = get_jwt_identity()
    rows = execute_query("SELECT role FROM users WHERE id=%s", (user_id,), fetch=True)
    role = rows[0]["role"] if rows else None
    if role != "domain_lead":
        return jsonify({"error": "Only domain leads can use this endpoint"}), 403
    domain_id = request.json.get("domain_id")
    if not domain_id:
        return jsonify({"error": "domain_id required"}), 400
    execute_query(
        "INSERT INTO domain_leads (user_id, domain_id) VALUES (%s,%s) ON DUPLICATE KEY UPDATE domain_id=%s",
        (user_id, domain_id, domain_id)
    )
    # Automatically add to user_domains as well so they are joined to the domain they manage
    execute_query(
        "INSERT IGNORE INTO user_domains (user_id, domain_id) VALUES (%s,%s)",
        (user_id, domain_id)
    )
    return jsonify({"message": "Domain assigned successfully"})


# ── Delete User ───────────────────────────────────────────────────────────────

@auth_bp.route("/delete-user/<int:target_id>", methods=["DELETE"])
@jwt_required()
def delete_user(target_id):
    user_id = int(get_jwt_identity())
    live = execute_query("SELECT role FROM users WHERE id=%s", (user_id,), fetch=True)
    role = live[0]["role"] if live else None
    if target_id == user_id:
        return jsonify({"error": "You cannot delete your own account"}), 400
    target = execute_query("SELECT * FROM users WHERE id=%s", (target_id,), fetch=True)
    if not target:
        return jsonify({"error": "User not found"}), 404
    target = target[0]
    if role in ("admin", "faculty"):
        pass
    elif role == "domain_lead":
        lead = execute_query("SELECT domain_id FROM domain_leads WHERE user_id=%s", (user_id,), fetch=True)
        if not lead:
            return jsonify({"error": "Domain lead domain not assigned"}), 403
        domain_id = lead[0]["domain_id"]
        in_domain = execute_query("SELECT 1 FROM user_domains WHERE user_id=%s AND domain_id=%s", (target_id, domain_id), fetch=True)
        if not in_domain:
            return jsonify({"error": "You can only delete users from your domain"}), 403
        if target["role"] in ("admin", "domain_lead"):
            return jsonify({"error": "Domain leads can only delete club members"}), 403
    else:
        return jsonify({"error": "Access denied"}), 403
    execute_query("DELETE FROM users WHERE id=%s", (target_id,))
    return jsonify({"message": f"User '{target['name']}' deleted successfully"})


# ── List Users ────────────────────────────────────────────────────────────────

@auth_bp.route("/users", methods=["GET"])
@jwt_required()
def list_users():
    user_id = get_jwt_identity()
    # Always read live role from DB
    rows = execute_query("SELECT role FROM users WHERE id=%s", (user_id,), fetch=True)
    role = rows[0]["role"] if rows else None
    if role in ("admin", "faculty"):
        rows = execute_query(
            "SELECT id, name, email, role, department, year, regno, is_verified FROM users WHERE is_approved=TRUE ORDER BY role, name",
            fetch=True
        )
    elif role == "domain_lead":
        lead = execute_query("SELECT domain_id FROM domain_leads WHERE user_id=%s", (user_id,), fetch=True)
        if not lead:
            return jsonify([]), 200
        domain_id = lead[0]["domain_id"]
        rows = execute_query(
            """SELECT u.id, u.name, u.email, u.role, u.department, u.year, u.regno, u.is_verified
               FROM users u JOIN user_domains ud ON u.id=ud.user_id
               WHERE ud.domain_id=%s AND u.role='member' AND u.is_approved=TRUE ORDER BY u.name""",
            (domain_id,), fetch=True
        )
    else:
        return jsonify({"error": "Access denied"}), 403
    return jsonify(rows)
