"""
Auth blueprint utility functions.

Provides:
  - OTP generation, storage (bcrypt-hashed), and verification
  - HTML email sending via Flask-Mail
  - Reusable decorator: roles_required(*role_names)
  - Reusable decorator: verified_required
"""
import random
import string
import bcrypt
from datetime import datetime, timedelta
from functools import wraps
from flask import jsonify, current_app
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity, get_jwt
from flask_mail import Message

from ..extensions import db, mail
from ..models.user import OTPToken, User


# ── OTP helpers ───────────────────────────────────────────────────────────────

def generate_otp(user_id: str, length: int = 6) -> str:
    """
    Invalidate any existing active OTPs, then create a new one.
    Stores a bcrypt hash in the DB.  Returns the plaintext OTP.
    """
    # Expire all active OTPs for this user first
    OTPToken.query.filter_by(user_id=user_id, used=False).update({"used": True})
    db.session.flush()

    otp = "".join(random.choices(string.digits, k=length))
    hashed = bcrypt.hashpw(otp.encode(), bcrypt.gensalt()).decode()
    expires_at = datetime.utcnow() + timedelta(minutes=15)

    token = OTPToken(
        user_id=user_id,
        token_hash=hashed,
        expires_at=expires_at,
        used=False,
    )
    db.session.add(token)
    db.session.commit()
    return otp


def verify_otp(user_id: str, otp_text: str) -> tuple[bool, str]:
    """
    Verify the most recent active OTP for a user.
    Returns (success: bool, message: str).
    """
    token = (
        OTPToken.query
        .filter_by(user_id=user_id, used=False)
        .order_by(OTPToken.created_at.desc())
        .first()
    )

    if not token:
        return False, "No active OTP found. Please request a new one."

    if token.is_expired():
        token.used = True
        db.session.commit()
        return False, "OTP has expired. Please request a new one."

    if not bcrypt.checkpw(otp_text.encode(), token.token_hash.encode()):
        return False, "Invalid OTP. Please try again."

    token.used = True
    db.session.commit()
    return True, "OTP verified successfully."


# ── Email helpers ─────────────────────────────────────────────────────────────

def send_verification_email(user: User, otp: str) -> bool:
    """Send a styled HTML OTP verification email. Returns True on success."""
    try:
        msg = Message(
            subject="🔐 Verify Your Email — QR Attendance",
            recipients=[user.email],
            html=_build_otp_email_html(user.name, otp),
        )
        mail.send(msg)
        return True
    except Exception as exc:
        current_app.logger.error(
            "Failed to send verification email to %s: %s", user.email, exc
        )
        return False


def _build_otp_email_html(name: str, otp: str) -> str:
    """Return the HTML body for the OTP verification email."""
    digits_html = f"""
    <div style="font-size:28px; letter-spacing:2px; font-weight:bold;">
    {' '.join(otp)}
    </div>
    """
    return f"""
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Email Verification</title>
</head>
<body style="margin:0;padding:0;background:#07070f;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"
         style="background:linear-gradient(135deg,#07070f 0%,#0f0f1a 100%);min-height:100vh;">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table width="520" cellpadding="0" cellspacing="0"
               style="background:rgba(255,255,255,0.05);backdrop-filter:blur(20px);
                      border-radius:20px;border:1px solid rgba(139,92,246,0.25);
                      box-shadow:0 0 60px rgba(139,92,246,0.12);">
          <!-- Header -->
          <tr>
            <td style="padding:40px 40px 0;text-align:center;">
              <div style="font-size:40px;margin-bottom:12px;">🎓</div>
              <h1 style="margin:0;font-size:22px;color:#f1f5f9;font-weight:700;">
                QR Attendance System
              </h1>
              <p style="margin:6px 0 0;font-size:14px;color:#8b5cf6;font-weight:500;
                        letter-spacing:0.5px;">EMAIL VERIFICATION</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <p style="color:#94a3b8;font-size:16px;line-height:1.6;margin:0 0 8px;">
                Hi <strong style="color:#e9d5ff;">{name}</strong>,
              </p>
              <p style="color:#94a3b8;font-size:16px;line-height:1.6;margin:0 0 28px;">
                Use the one-time passcode below to verify your email address
                and activate your account.
              </p>
              <!-- OTP Box -->
              <div style="text-align:center;padding:28px 20px;
                          background:rgba(139,92,246,0.08);border-radius:14px;
                          border:1px solid rgba(139,92,246,0.2);margin-bottom:24px;">
                {digits_html}
                <p style="margin:16px 0 0;color:#64748b;font-size:13px;">
                  ⏱&nbsp; Valid for <strong style="color:#a78bfa;">15 minutes</strong>
                  &nbsp;·&nbsp; Do not share this code
                </p>
              </div>
              <p style="color:#64748b;font-size:13px;line-height:1.6;margin:0;">
                If you did not create an account on QR Attendance System,
                you can safely ignore this email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:0 40px 36px;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="color:#475569;font-size:12px;text-align:center;margin:24px 0 0;">
                QR Attendance System &bull; This is an automated message, please do not reply
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


# ── Decorators ────────────────────────────────────────────────────────────────

def roles_required(*role_names: str):
    """
    Route decorator: require the authenticated user to have at least one
    of the given roles.  Must be applied AFTER @jwt_required().
    Usage:
        @roles_required("admin", "domain_lead")
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            user_id = get_jwt_identity()
            user: User | None = User.query.get(user_id)
            if not user or not user.is_active:
                return jsonify({"error": "User not found or account inactive"}), 401
            if not user.has_role(*role_names):
                return jsonify({
                    "error": "Insufficient permissions",
                    "required_roles": list(role_names),
                }), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def verified_required(fn):
    """
    Route decorator: require the authenticated user to have verified their email.
    Must be applied AFTER @jwt_required().
    """
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        user_id = get_jwt_identity()
        user: User | None = User.query.get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 401
        if not user.is_verified:
            return jsonify({
                "error": "Email verification required",
                "code":  "email_not_verified",
            }), 403
        return fn(*args, **kwargs)
    return wrapper

def otp_required(fn):
    """
    Require OTP verification for current login session.
    Must be used AFTER @jwt_required()
    """
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        claims = get_jwt()

        if not claims.get("otp_verified"):
            return jsonify({
                "error": "OTP verification required",
                "code": "otp_required"
            }), 403

        return fn(*args, **kwargs)

    return wrapper