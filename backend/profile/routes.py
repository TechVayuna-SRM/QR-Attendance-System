from flask import jsonify, request
from . import profile_bp
from session_auth import login_required
from db import execute_query


@profile_bp.route("/")
@login_required
def get_profile():
    user_id = request.user_id
    rows = execute_query(
        "SELECT id, name, email, role, department, year, regno, is_verified, is_approved, face_registered FROM users WHERE id=%s",
        (user_id,), fetch=True
    )
    if not rows:
        return jsonify({"error": "User not found"}), 404
    user = rows[0]
    user["domains"] = execute_query(
        "SELECT d.id, d.name FROM domains d JOIN user_domains ud ON d.id=ud.domain_id WHERE ud.user_id=%s",
        (user_id,), fetch=True
    ) or []
    return jsonify({"user": user}), 200


@profile_bp.route("/edit", methods=["PUT"])
@login_required
def edit_profile():
    user_id = request.user_id
    data = request.get_json(silent=True) or {}
    name       = str(data.get("name", "")).strip()
    year       = str(data.get("year", "")).strip()
    department = str(data.get("department", "")).strip()
    if not name:
        return jsonify({"error": "Name cannot be empty"}), 400
    execute_query(
        "UPDATE users SET name=%s, year=%s, department=%s WHERE id=%s",
        (name, year, department, user_id)
    )
    rows = execute_query("SELECT id, name, email, role, department, year, regno FROM users WHERE id=%s", (user_id,), fetch=True)
    return jsonify({"message": "Profile updated", "user": rows[0]}), 200


@profile_bp.route("/domains", methods=["PUT"])
@login_required
def request_domains():
    """User selects domains — creates pending join requests, does NOT directly join."""
    user_id = request.user_id
    data = request.get_json(silent=True) or {}
    domain_ids = data.get("domain_ids", [])
    if not isinstance(domain_ids, list):
        return jsonify({"error": "domain_ids must be a list"}), 400

    # Get domains user already belongs to (skip those)
    existing = execute_query(
        "SELECT domain_id FROM user_domains WHERE user_id=%s", (user_id,), fetch=True
    ) or []
    existing_ids = {r["domain_id"] for r in existing}

    # Get already pending requests (skip duplicates)
    pending = execute_query(
        "SELECT domain_id FROM domain_join_requests WHERE user_id=%s AND status='pending'",
        (user_id,), fetch=True
    ) or []
    pending_ids = {r["domain_id"] for r in pending}

    inserted = 0
    for did in domain_ids:
        if did in existing_ids or did in pending_ids:
            continue
        execute_query(
            "INSERT IGNORE INTO domain_join_requests (user_id, domain_id, status) VALUES (%s,%s,'pending')",
            (user_id, did)
        )
        inserted += 1

    requests_out = execute_query(
        """SELECT djr.id, djr.domain_id, d.name as domain_name, djr.status
           FROM domain_join_requests djr
           JOIN domains d ON d.id=djr.domain_id
           WHERE djr.user_id=%s AND djr.status='pending'""",
        (user_id,), fetch=True
    ) or []

    return jsonify({
        "message": f"{inserted} domain request(s) submitted. Awaiting admin approval.",
        "pending_requests": requests_out
    }), 200


@profile_bp.route("/domains/all")
@login_required
def get_all_domains():
    rows = execute_query("SELECT id, name FROM domains ORDER BY name", fetch=True) or []
    return jsonify({"domains": rows}), 200


@profile_bp.route("/requests")
@login_required
def get_my_requests():
    user_id = request.user_id
    rows = execute_query(
        """SELECT djr.id, djr.domain_id, d.name as domain_name, djr.status, djr.created_at
           FROM domain_join_requests djr
           JOIN domains d ON d.id=djr.domain_id
           WHERE djr.user_id=%s AND djr.status='pending'
           ORDER BY djr.created_at DESC""",
        (user_id,), fetch=True
    ) or []
    for r in rows:
        if r.get("created_at"):
            r["created_at"] = str(r["created_at"])
    return jsonify({"requests": rows}), 200
