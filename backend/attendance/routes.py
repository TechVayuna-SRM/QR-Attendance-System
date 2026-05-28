import datetime
from datetime import timezone
from flask import Blueprint, request, jsonify, send_file
from db import execute_query
from session_auth import login_required, role_required
from face.utils import save_face_image, verify_face
from qr.utils import generate_qr_token, generate_qr_image, get_expiry, is_within_session_window

attendance_bp = Blueprint("attendance", __name__)

# ── QR Status ────────────────────────────────────────────────────
@attendance_bp.route("/qr-status", methods=["GET"])
@role_required("admin", "faculty")
def qr_status():
    today = datetime.date.today()
    existing = execute_query(
        "SELECT id FROM qr_sessions WHERE DATE(generated_at)=%s", (today,), fetch=True
    )
    return jsonify({"generated_today": bool(existing)})

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
    if not is_within_session_window():
        return jsonify({"error": "QR can only be generated on Wednesday 12:40–1:30 PM"}), 403

    today = datetime.date.today()
    existing = execute_query(
        "SELECT id FROM qr_sessions WHERE DATE(generated_at)=%s", (today,), fetch=True
    )
    if existing:
        return jsonify({"error": "A QR code has already been generated for this Wednesday."}), 409

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

    return send_file(qr_path, mimetype="image/png")

# ── QR Scan + Face Verify → Mark Present ────────────────────────
@attendance_bp.route("/scan", methods=["POST"])
@login_required
def scan_qr():
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
    rows = execute_query(
        """SELECT a.date, a.status, d.name as domain, a.marked_at
           FROM attendance a JOIN domains d ON a.domain_id=d.id
           WHERE a.user_id=%s ORDER BY a.date DESC""",
        (request.user_id,), fetch=True
    )
    return jsonify(rows)
