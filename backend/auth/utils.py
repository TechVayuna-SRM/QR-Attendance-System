import random
import string
import bcrypt
from datetime import datetime, timedelta
from functools import wraps
from flask import jsonify, current_app
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity, get_jwt
from flask_mail import Message

from extensions import db, mail
from models.user import OTPToken, User


# ── OTP helpers ───────────────────────────────────────────────────────────────

def generate_otp(user_id, length=6):
    OTPToken.query.filter_by(user_id=user_id, used=False).update({"used": True})
    db.session.flush()

    otp        = "".join(random.choices(string.digits, k=length))
    hashed     = bcrypt.hashpw(otp.encode(), bcrypt.gensalt()).decode()
    expires_at = datetime.utcnow() + timedelta(minutes=15)

    db.session.add(OTPToken(user_id=user_id, token_hash=hashed, expires_at=expires_at, used=False))
    db.session.commit()
    return otp


def verify_otp(user_id, otp_text):
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

def send_verification_email(user, otp):
    try:
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
          <p style="color:#94a3b8;font-size:16px;">Hi <strong style="color:#e9d5ff;">{user.name}</strong>,</p>
          <p style="color:#94a3b8;font-size:16px;">Use the one-time passcode below to verify your email.</p>
          <div style="text-align:center;padding:28px 20px;background:rgba(139,92,246,0.08);border-radius:14px;border:1px solid rgba(139,92,246,0.2);margin-bottom:24px;">
            {digits_html}
            <p style="margin:16px 0 0;color:#64748b;font-size:13px;">⏱ Valid for <strong style="color:#a78bfa;">15 minutes</strong></p>
          </div>
        </td></tr>
        <tr><td style="padding:0 40px 36px;border-top:1px solid rgba(255,255,255,0.06);">
          <p style="color:#475569;font-size:12px;text-align:center;margin:24px 0 0;">QR Attendance System &bull; Automated message, do not reply</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""
        msg = Message(subject="🔐 Verify Your Email — QR Attendance", recipients=[user.email], html=html_body)
        mail.send(msg)
        return True
    except Exception as exc:
        current_app.logger.error("Failed to send verification email to %s: %s", user.email, exc)
        return False


# ── Decorators ────────────────────────────────────────────────────────────────

def roles_required(*role_names):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            user_id = get_jwt_identity()
            user    = User.query.get(user_id)
            if not user or not user.is_active:
                return jsonify({"error": "User not found or account inactive"}), 401
            if not user.has_role(*role_names):
                return jsonify({"error": "Insufficient permissions", "required_roles": list(role_names)}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def verified_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        user_id = get_jwt_identity()
        user    = User.query.get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 401
        if not user.is_verified:
            return jsonify({"error": "Email verification required", "code": "email_not_verified"}), 403
        return fn(*args, **kwargs)
    return wrapper


def otp_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        claims = get_jwt()
        if not claims.get("otp_verified"):
            return jsonify({"error": "OTP verification required", "code": "otp_required"}), 403
        return fn(*args, **kwargs)
    return wrapper
