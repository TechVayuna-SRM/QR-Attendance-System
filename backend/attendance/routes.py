import datetime
from datetime import timezone
from flask import Blueprint, request, jsonify, send_file
from db import execute_query
from session_auth import login_required, role_required
from face.utils import save_face_image, verify_face
from qr.utils import generate_qr_token, generate_qr_image, get_expiry, is_within_session_window
from config import Config
from attendance.utils import close_expired_sessions_and_mark_absent

attendance_bp = Blueprint("attendance", __name__)

def send_qr_file(path):
    response = send_file(path, mimetype="image/png")
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


# ── QR Status ────────────────────────────────────────────────────
@attendance_bp.route("/qr-status", methods=["GET"])
@role_required("admin", "faculty")
def qr_status():
    close_expired_sessions_and_mark_absent()
    today = datetime.date.today()
    now = datetime.datetime.now(timezone.utc).astimezone()
    existing = execute_query(
        "SELECT id FROM qr_sessions WHERE DATE(generated_at)=%s", (today,), fetch=True
    )
    
    # Check if there is currently an active session
    active_sessions = execute_query(
        "SELECT expires_at FROM qr_sessions WHERE is_active=TRUE AND expires_at > %s ORDER BY id DESC LIMIT 1",
        (now,), fetch=True
    )
    
    bypass = getattr(Config, "BYPASS_QR_RESTRICTIONS", False)
    
    res = {
        "generated_today": bool(existing) if not bypass else False,
        "bypass_active": bypass,
        "has_active_session": False,
        "seconds_remaining": 0
    }
    
    if active_sessions:
        expires_at = active_sessions[0]["expires_at"]
        if isinstance(expires_at, datetime.datetime):
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=now.tzinfo)
            delta = expires_at - now
            seconds = int(delta.total_seconds())
            if seconds > 0:
                res["has_active_session"] = True
                res["seconds_remaining"] = seconds
                res["expires_at"] = expires_at.isoformat()
                
    response = jsonify(res)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

# ── Active QR Image Download ──────────────────────────────────────
@attendance_bp.route("/active-qr-image", methods=["GET"])
@role_required("admin", "faculty")
def active_qr_image():
    close_expired_sessions_and_mark_absent()
    now = datetime.datetime.now(timezone.utc).astimezone()
    rows = execute_query(
        "SELECT token FROM qr_sessions WHERE is_active=TRUE AND expires_at > %s ORDER BY id DESC LIMIT 1",
        (now,), fetch=True
    )
    if not rows:
        return jsonify({"error": "No active session found"}), 404
        
    token = rows[0]["token"]
    import os
    from werkzeug.utils import secure_filename
    filename = secure_filename(f"{token}.png")
    qr_path = os.path.join(Config.QR_FOLDER, filename)
    
    if os.path.exists(qr_path):
        return send_qr_file(qr_path)
    else:
        # Regenerate QR image if it was deleted
        from qr.utils import generate_qr_image
        try:
            path = generate_qr_image(token)
            return send_qr_file(path)
        except Exception as e:
            return jsonify({"error": f"Failed to regenerate QR image: {str(e)}"}), 500

# ── Scan Window Status (Accessible by all logged-in users) ─────
@attendance_bp.route("/scan-window-status", methods=["GET"])
@login_required
def scan_window_status():
    bypass = getattr(Config, "BYPASS_QR_RESTRICTIONS", False)
    return jsonify({
        "is_within_window": is_within_session_window(),
        "bypass_active": bypass
    })

# ── Face Registration (once only, not required for faculty) ────
@attendance_bp.route("/register-face", methods=["POST"])
@login_required
def register_face():
    if request.role == "faculty":
        return jsonify({"error": "Faculty do not require face registration"}), 400

    rows = execute_query("SELECT face_registered FROM users WHERE id=%s", (request.user_id,), fetch=True)
    if not rows:
        return jsonify({"error": "User not found"}), 404
    if rows[0]["face_registered"]:
        return jsonify({"error": "Face already registered and cannot be changed"}), 400

    b64 = request.json.get("image")
    if not b64:
        return jsonify({"error": "No image provided"}), 400
    try:
        path = save_face_image(request.user_id, b64)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    execute_query(
        "UPDATE users SET face_registered=TRUE, face_image_path=%s WHERE id=%s",
        (path, request.user_id)
    )
    return jsonify({"message": "Face registered successfully"})

# ── QR Generation (Admin/Faculty only, once per Wednesday) ──────
@attendance_bp.route("/generate-qr", methods=["POST"])
@role_required("admin", "faculty")
def generate_qr():
    close_expired_sessions_and_mark_absent()
    if not is_within_session_window():
        return jsonify({"error": "QR can only be generated on Wednesday 12:40–1:30 PM"}), 403

    today = datetime.date.today()

    # Limit: One QR code per Wednesday session
    if not getattr(Config, "BYPASS_QR_RESTRICTIONS", False):
        existing = execute_query(
            "SELECT id FROM qr_sessions WHERE DATE(generated_at)=%s", (today,), fetch=True
        )
        if existing:
            return jsonify({"error": "A QR code has already been generated for today's session."}), 400

    token = generate_qr_token()
    expires_at = get_expiry()
    session_id = execute_query(
        "INSERT INTO qr_sessions (token, generated_by, expires_at) VALUES (%s, %s, %s)",
        (token, request.user_id, expires_at)
    )
    qr_path = generate_qr_image(token)

    # Insert absent rows for all verified members
    members = execute_query(
        "SELECT u.id, ud.domain_id FROM users u JOIN user_domains ud ON u.id=ud.user_id WHERE u.is_verified=TRUE",
        fetch=True
    )
    for m in members:
        execute_query(
            "INSERT IGNORE INTO attendance (user_id, domain_id, qr_session_id, status, date) VALUES (%s,%s,%s,'absent',%s)",
            (m["id"], m["domain_id"], session_id, today)
        )

    # Also insert absent row for the admin/faculty who generated the QR
    # so they can mark themselves present via scan
    generator_domains = execute_query(
        "SELECT domain_id FROM user_domains WHERE user_id=%s", (request.user_id,), fetch=True
    )
    for d in generator_domains:
        execute_query(
            "INSERT IGNORE INTO attendance (user_id, domain_id, qr_session_id, status, date) VALUES (%s,%s,%s,'absent',%s)",
            (request.user_id, d["domain_id"], session_id, today)
        )

    return send_qr_file(qr_path)

# ── QR Scan + Face Verify → Mark Present ────────────────────────
@attendance_bp.route("/scan", methods=["POST"])
@login_required
def scan_qr():
    close_expired_sessions_and_mark_absent()
    data = request.json
    token = data.get("token")
    face_image = data.get("image")
    domain_id = data.get("domain_id")

    if not all([token, face_image, domain_id]):
        return jsonify({"error": "token, image, and domain_id required"}), 400

    now = datetime.datetime.now(timezone.utc).astimezone()
    rows = execute_query(
        "SELECT * FROM qr_sessions WHERE token=%s AND is_active=TRUE AND expires_at > %s",
        (token, now), fetch=True
    )
    if not rows:
        execute_query(
            "UPDATE qr_sessions SET is_active=FALSE WHERE token=%s AND expires_at <= %s",
            (token, now)
        )
        return jsonify({"error": "QR code is invalid or expired"}), 400

    session_row = rows[0]
    user_rows = execute_query(
        "SELECT role, is_verified, is_approved, face_registered FROM users WHERE id=%s", (request.user_id,), fetch=True
    )
    if not user_rows or not user_rows[0]["is_verified"]:
        return jsonify({"error": "Email not verified"}), 403
    user_role = user_rows[0]["role"]

    # Faculty do not mark attendance via QR scan
    if user_role == "faculty":
        return jsonify({"error": "Faculty do not mark attendance via QR scan"}), 403

    # Admin and faculty are always considered approved
    if user_role not in ("admin", "faculty") and not user_rows[0]["is_approved"]:
        return jsonify({"error": "Your account is pending admin approval."}), 403
    if not user_rows[0]["face_registered"]:
        return jsonify({"error": "Face not registered. Please register your face first."}), 403

    try:
        matched = verify_face(request.user_id, face_image)
    except Exception as e:
        return jsonify({"error": f"Face verification failed: {str(e)}"}), 400

    if not matched:
        return jsonify({"error": "Face does not match. Proxy attendance prevented."}), 403

    today = datetime.date.today()
    now_utc = datetime.datetime.now(timezone.utc).astimezone()
    
    # 1. Update all existing attendance records for this user on this date to 'present'
    execute_query(
        """UPDATE attendance 
           SET status='present', marked_at=%s, qr_session_id=%s
           WHERE user_id=%s AND date=%s""",
        (now_utc, session_row["id"], request.user_id, today)
    )
    # 2. Insert/update the specific domain_id just in case
    execute_query(
        """INSERT INTO attendance (user_id, domain_id, qr_session_id, status, marked_at, date)
           VALUES (%s, %s, %s, 'present', %s, %s)
           ON DUPLICATE KEY UPDATE status='present', marked_at=%s, qr_session_id=%s""",
        (request.user_id, domain_id, session_row["id"], now_utc, today, now_utc, session_row["id"])
    )
    return jsonify({"message": "Attendance marked as present"})

# ── Admin self-attendance (QR + face required) ─────────────────
@attendance_bp.route("/mark-admin", methods=["POST"])
@login_required
def mark_admin_attendance():
    close_expired_sessions_and_mark_absent()
    user_rows = execute_query(
        "SELECT role, face_registered FROM users WHERE id=%s", (request.user_id,), fetch=True
    )
    if not user_rows or user_rows[0]["role"] != "admin":
        return jsonify({"error": "Only admins can use this endpoint"}), 403
    if not user_rows[0]["face_registered"]:
        return jsonify({"error": "Face not registered. Please register your face first."}), 403

    data = request.json or {}
    token = data.get("token")
    domain_id = data.get("domain_id")
    face_image = data.get("image")
    if not token or not domain_id or not face_image:
        return jsonify({"error": "token, domain_id, and image required"}), 400

    now = datetime.datetime.now(timezone.utc).astimezone()
    rows = execute_query(
        "SELECT * FROM qr_sessions WHERE token=%s AND is_active=TRUE AND expires_at > %s",
        (token, now), fetch=True
    )
    if not rows:
        return jsonify({"error": "QR code is invalid or expired"}), 400

    try:
        matched = verify_face(request.user_id, face_image)
    except Exception as e:
        return jsonify({"error": f"Face verification failed: {str(e)}"}), 400
    if not matched:
        return jsonify({"error": "Face does not match. Proxy attendance prevented."}), 403

    session_row = rows[0]
    today = datetime.date.today()
    
    # 1. Update all existing attendance records for this user on this date to 'present'
    execute_query(
        """UPDATE attendance 
           SET status='present', marked_at=%s, qr_session_id=%s
           WHERE user_id=%s AND date=%s""",
        (now, session_row["id"], request.user_id, today)
    )
    # 2. Insert/update the specific domain_id just in case
    execute_query(
        """INSERT INTO attendance (user_id, domain_id, qr_session_id, status, marked_at, date)
           VALUES (%s, %s, %s, 'present', %s, %s)
           ON DUPLICATE KEY UPDATE status='present', marked_at=%s, qr_session_id=%s""",
        (request.user_id, domain_id, session_row["id"], now, today, now, session_row["id"])
    )
    return jsonify({"message": "Attendance marked as present"})

# ── Get My Attendance ────────────────────────────────────────────
@attendance_bp.route("/my", methods=["GET"])
@login_required
def my_attendance():
    close_expired_sessions_and_mark_absent()
    rows = execute_query(
        """SELECT a.date, 
                  CASE WHEN SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) > 0 THEN 'present' ELSE 'absent' END as status,
                  GROUP_CONCAT(d.name ORDER BY d.name SEPARATOR ', ') as domain,
                  MAX(a.marked_at) as marked_at
           FROM attendance a JOIN domains d ON a.domain_id=d.id
           WHERE a.user_id=%s 
           GROUP BY a.date 
           ORDER BY a.date DESC""",
        (request.user_id,), fetch=True
    )
    # Convert date and marked_at to strings since GROUP_CONCAT/aggregations might output bytearray or datetime objects
    for r in rows:
        if r.get("date"):
            r["date"] = str(r["date"])
        if r.get("marked_at"):
            r["marked_at"] = str(r["marked_at"])
    return jsonify(rows)
