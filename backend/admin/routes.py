from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity

from . import admin_bp
from session_auth import role_required
from db import execute_query

ADMIN_ROLES = ("admin", "faculty")


@admin_bp.route("/users")
@role_required(*ADMIN_ROLES)
def list_users():
    page        = request.args.get("page", 1, type=int)
    per_page    = min(request.args.get("per_page", 20, type=int), 100)
    search      = request.args.get("search", "").strip()

    # Query legacy users table
    where = "WHERE is_approved=TRUE"
    params = []
    if search:
        where += " AND (name LIKE %s OR email LIKE %s)"
        params += [f"%{search}%", f"%{search}%"]

    total_rows = execute_query(f"SELECT COUNT(*) as cnt FROM users {where}", params, fetch=True)
    total = total_rows[0]["cnt"] if total_rows else 0
    pages = max(1, (total + per_page - 1) // per_page)
    offset = (page - 1) * per_page

    rows = execute_query(
        f"SELECT id, name, email, role, department, year, regno as registration_number, "
        f"is_verified, is_approved, face_registered, google_id, "
        f"NULL as avatar_url, NULL as section, created_at "
        f"FROM users {where} ORDER BY created_at DESC LIMIT %s OFFSET %s",
        params + [per_page, offset], fetch=True
    ) or []

    # Normalise: add roles array
    for u in rows:
        u["roles"] = [u["role"]] if u.get("role") else []
        u["is_verified"]  = bool(u.get("is_verified"))
        u["is_approved"]  = bool(u.get("is_approved"))
        u["face_registered"] = bool(u.get("face_registered"))
        if u.get("created_at"):
            u["created_at"] = u["created_at"].isoformat()

    return jsonify({
        "users":        rows,
        "total":        total,
        "pages":        pages,
        "current_page": page,
        "per_page":     per_page,
    }), 200


@admin_bp.route("/users/<string:user_id>")
@role_required(*ADMIN_ROLES)
def get_user(user_id):
    rows = execute_query("SELECT id, name, email, role, department, year, regno as registration_number, is_verified, is_approved, face_registered FROM users WHERE id=%s", (user_id,), fetch=True)
    if not rows:
        return jsonify({"error": "User not found"}), 404
    u = rows[0]
    u["roles"] = [u["role"]] if u.get("role") else []
    return jsonify({"user": u}), 200


@admin_bp.route("/users/<string:user_id>/role", methods=["POST"])
@role_required(*ADMIN_ROLES)
def manage_user_role(user_id):
    rows = execute_query("SELECT id, role FROM users WHERE id=%s", (user_id,), fetch=True)
    if not rows:
        return jsonify({"error": "User not found"}), 404

    data      = request.get_json(silent=True) or {}
    action    = data.get("action")
    role_name = data.get("role")

    valid_roles = {"admin", "domain_lead", "club_member", "member", "faculty"}
    if action not in ("add", "remove") or role_name not in valid_roles:
        return jsonify({"error": "Invalid action or role"}), 400

    if action == "add":
        execute_query("UPDATE users SET role=%s WHERE id=%s", (role_name, user_id))
    else:
        execute_query("UPDATE users SET role='member' WHERE id=%s", (user_id,))

    updated = execute_query("SELECT id, name, email, role FROM users WHERE id=%s", (user_id,), fetch=True)[0]
    updated["roles"] = [updated["role"]]
    return jsonify({"message": f"Role '{role_name}' {action}ed successfully", "user": updated}), 200


@admin_bp.route("/users/<string:user_id>/toggle-active", methods=["POST"])
@role_required(*ADMIN_ROLES)
def toggle_user_active(user_id):
    rows = execute_query("SELECT id FROM users WHERE id=%s", (user_id,), fetch=True)
    if not rows:
        return jsonify({"error": "User not found"}), 404
    # Legacy table has no is_active; use is_approved as proxy
    execute_query("UPDATE users SET is_approved = NOT is_approved WHERE id=%s", (user_id,))
    updated = execute_query("SELECT is_approved FROM users WHERE id=%s", (user_id,), fetch=True)[0]
    return jsonify({"message": "User toggled", "is_active": bool(updated["is_approved"])}), 200


@admin_bp.route("/users/<string:user_id>", methods=["DELETE"])
@role_required(*ADMIN_ROLES)
def delete_user(user_id):
    from flask_jwt_extended import get_jwt_identity
    if str(get_jwt_identity()) == str(user_id):
        return jsonify({"error": "Cannot delete your own account"}), 400
    rows = execute_query("SELECT id FROM users WHERE id=%s", (user_id,), fetch=True)
    if not rows:
        return jsonify({"error": "User not found"}), 404
    execute_query("DELETE FROM users WHERE id=%s", (user_id,))
    return jsonify({"message": "User account permanently deleted"}), 200


@admin_bp.route("/users/<string:user_id>/approve", methods=["POST"])
@role_required(*ADMIN_ROLES)
def approve_user(user_id):
    rows = execute_query("SELECT id FROM users WHERE id=%s", (user_id,), fetch=True)
    if not rows:
        return jsonify({"error": "User not found"}), 404
    execute_query("UPDATE users SET is_approved=TRUE WHERE id=%s", (user_id,))
    updated = execute_query("SELECT id, name, email, role, is_approved FROM users WHERE id=%s", (user_id,), fetch=True)[0]
    updated["roles"] = [updated["role"]]
    return jsonify({"message": "User approved successfully", "user": updated}), 200


@admin_bp.route("/pending-approvals")
@role_required(*ADMIN_ROLES)
def list_pending_approvals():
    rows = execute_query(
        "SELECT id, name, email, role, department, year, regno as registration_number, NULL as section "
        "FROM users WHERE is_approved=FALSE AND regno IS NOT NULL ORDER BY id DESC",
        fetch=True
    ) or []
    for u in rows:
        u["roles"] = [u["role"]] if u.get("role") else []
        u["avatar_url"] = None
    return jsonify({"users": rows}), 200


@admin_bp.route("/domains")
@role_required(*ADMIN_ROLES)
def list_domains():
    rows = execute_query(
        """SELECT d.id, d.name, NULL as description, NULL as icon,
                  dl.user_id as lead_id, u.name as lead_name,
                  (SELECT COUNT(*) FROM domain_join_requests WHERE domain_id=d.id AND status='pending') as pending_count
           FROM domains d
           LEFT JOIN domain_leads dl ON d.id=dl.domain_id
           LEFT JOIN users u ON dl.user_id=u.id
           ORDER BY d.name""",
        fetch=True
    ) or []
    return jsonify({"domains": rows}), 200


@admin_bp.route("/domains", methods=["POST"])
@role_required(*ADMIN_ROLES)
def create_domain():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()
    if not name:
        return jsonify({"error": "'name' is required"}), 400
    existing = execute_query("SELECT id FROM domains WHERE name=%s", (name,), fetch=True)
    if existing:
        return jsonify({"error": "Domain already exists"}), 400
    new_id = execute_query("INSERT INTO domains (name) VALUES (%s)", (name,))
    return jsonify({"message": "Domain created", "domain": {"id": new_id, "name": name, "icon": None, "description": None, "lead_id": None, "lead_name": None}}), 201


@admin_bp.route("/domains/<int:domain_id>", methods=["DELETE"])
@role_required(*ADMIN_ROLES)
def delete_domain(domain_id):
    rows = execute_query("SELECT name FROM domains WHERE id=%s", (domain_id,), fetch=True)
    if not rows:
        return jsonify({"error": "Domain not found"}), 404
    execute_query("DELETE FROM domains WHERE id=%s", (domain_id,))
    return jsonify({"message": f"Domain '{rows[0]['name']}' deleted"}), 200


@admin_bp.route("/domains/<int:domain_id>/lead", methods=["POST"])
@role_required(*ADMIN_ROLES)
def set_domain_lead(domain_id):
    rows = execute_query("SELECT id FROM domains WHERE id=%s", (domain_id,), fetch=True)
    if not rows:
        return jsonify({"error": "Domain not found"}), 404

    data = request.get_json(silent=True) or {}
    registration_number = data.get("registration_number", "").strip()

    # Find existing lead(s) for this domain to clean up their roles
    existing_leads = execute_query(
        "SELECT user_id FROM domain_leads WHERE domain_id=%s",
        (domain_id,), fetch=True
    ) or []

    for el in existing_leads:
        old_lead_id = el["user_id"]
        # Update user's role back to member
        execute_query("UPDATE users SET role='member' WHERE id=%s AND role='domain_lead'", (old_lead_id,))
        # Remove from domain_leads
        execute_query("DELETE FROM domain_leads WHERE user_id=%s AND domain_id=%s", (old_lead_id, domain_id))

    if registration_number:
        user_rows = execute_query("SELECT id FROM users WHERE regno=%s", (registration_number,), fetch=True)
        if not user_rows:
            return jsonify({"error": "User with this registration number not found"}), 404
        user_id = user_rows[0]["id"]
        
        # Check if the new user is already a lead of some other domain and clean it up
        execute_query("DELETE FROM domain_leads WHERE user_id=%s", (user_id,))
        
        # Insert domain lead assignment
        execute_query(
            "INSERT INTO domain_leads (user_id, domain_id) VALUES (%s,%s) ON DUPLICATE KEY UPDATE domain_id=%s",
            (user_id, domain_id, domain_id)
        )
        execute_query("UPDATE users SET role='domain_lead' WHERE id=%s", (user_id,))
        # Add the new lead to user_domains for that domain
        execute_query("INSERT IGNORE INTO user_domains (user_id, domain_id) VALUES (%s,%s)", (user_id, domain_id))

    return jsonify({"message": "Domain lead updated"}), 200


@admin_bp.route("/domain-requests")
@role_required(*ADMIN_ROLES)
def list_domain_requests():
    rows = execute_query(
        """SELECT djr.id, djr.user_id, djr.domain_id, djr.status, djr.created_at,
                  u.name as user_name, u.regno as registration_number, u.email,
                  d.name as domain_name
           FROM domain_join_requests djr
           JOIN users u ON u.id=djr.user_id
           JOIN domains d ON d.id=djr.domain_id
           WHERE djr.status='pending'
           ORDER BY djr.created_at DESC""",
        fetch=True
    ) or []
    for r in rows:
        if r.get("created_at"):
            r["created_at"] = str(r["created_at"])
    return jsonify({"requests": rows}), 200


@admin_bp.route("/domain-requests/<int:req_id>/approve", methods=["POST"])
@role_required(*ADMIN_ROLES)
def approve_domain_request(req_id):
    rows = execute_query(
        "SELECT user_id, domain_id FROM domain_join_requests WHERE id=%s AND status='pending'",
        (req_id,), fetch=True
    )
    if not rows:
        return jsonify({"error": "Request not found"}), 404
    r = rows[0]
    execute_query("UPDATE domain_join_requests SET status='approved' WHERE id=%s", (req_id,))
    execute_query("INSERT IGNORE INTO user_domains (user_id, domain_id) VALUES (%s,%s)", (r["user_id"], r["domain_id"]))
    return jsonify({"message": "Domain request approved"}), 200


@admin_bp.route("/domain-requests/<int:req_id>/reject", methods=["POST"])
@role_required(*ADMIN_ROLES)
def reject_domain_request(req_id):
    rows = execute_query(
        "SELECT id FROM domain_join_requests WHERE id=%s AND status='pending'",
        (req_id,), fetch=True
    )
    if not rows:
        return jsonify({"error": "Request not found"}), 404
    execute_query("UPDATE domain_join_requests SET status='rejected' WHERE id=%s", (req_id,))
    return jsonify({"message": "Domain request rejected"}), 200


@admin_bp.route("/stats")
@role_required(*ADMIN_ROLES)
def get_stats():
    total_rows    = execute_query("SELECT COUNT(*) as cnt FROM users", fetch=True)
    verified_rows = execute_query("SELECT COUNT(*) as cnt FROM users WHERE is_verified=TRUE", fetch=True)
    active_rows   = execute_query("SELECT COUNT(*) as cnt FROM users WHERE is_approved=TRUE", fetch=True)
    face_rows     = execute_query("SELECT COUNT(*) as cnt FROM users WHERE face_registered=TRUE", fetch=True)

    total_users    = total_rows[0]["cnt"]    if total_rows    else 0
    verified_users = verified_rows[0]["cnt"] if verified_rows else 0
    active_users   = active_rows[0]["cnt"]   if active_rows   else 0
    face_users     = face_rows[0]["cnt"]     if face_rows     else 0

    role_dist_rows = execute_query(
        "SELECT role, COUNT(*) as cnt FROM users GROUP BY role", fetch=True
    ) or []
    role_distribution = {"admin": 0, "domain_lead": 0, "club_member": 0}
    for r in role_dist_rows:
        key = r["role"] if r["role"] in role_distribution else "club_member"
        role_distribution[key] = role_distribution.get(key, 0) + r["cnt"]

    domain_rows = execute_query(
        "SELECT d.name, COUNT(ud.user_id) as user_count FROM domains d "
        "LEFT JOIN user_domains ud ON d.id=ud.domain_id GROUP BY d.id ORDER BY user_count DESC LIMIT 5",
        fetch=True
    ) or []
    top_domains = [{"domain": r["name"], "icon": "🔧", "user_count": r["user_count"]} for r in domain_rows]

    return jsonify({
        "total_users":        total_users,
        "verified_users":     verified_users,
        "active_users":       active_users,
        "face_registrations": face_users,
        "role_distribution":  role_distribution,
        "top_domains":        top_domains,
    }), 200


@admin_bp.route("/attendance/<int:attendance_id>", methods=["DELETE"])
@role_required("admin", "faculty", "domain_lead")
def delete_attendance(attendance_id):
    rows = execute_query("SELECT user_id, date, domain_id FROM attendance WHERE id=%s", (attendance_id,), fetch=True)
    if not rows:
        return jsonify({"error": "Attendance record not found"}), 404

    user_id = rows[0]["user_id"]
    att_date = rows[0]["date"]

    if request.role == "domain_lead":
        # Check if this domain lead is assigned to the domain of the attendance record
        lead_domain = execute_query(
            "SELECT domain_id FROM domain_leads WHERE user_id=%s AND domain_id=%s",
            (request.user_id, rows[0]["domain_id"]), fetch=True
        )
        if not lead_domain:
            return jsonify({"error": "Forbidden: You are not the lead of this domain"}), 403

        # Domain Leads only reset the record for the specific domain they manage
        execute_query(
            "UPDATE attendance SET status='absent', marked_at=NULL, qr_session_id=NULL WHERE id=%s",
            (attendance_id,)
        )
    else:
        # Admins and Faculty reset ALL attendance records for this user on this date
        execute_query(
            "UPDATE attendance SET status='absent', marked_at=NULL, qr_session_id=NULL WHERE user_id=%s AND date=%s",
            (user_id, att_date)
        )
    return jsonify({"message": "Attendance record reset to absent successfully"}), 200

