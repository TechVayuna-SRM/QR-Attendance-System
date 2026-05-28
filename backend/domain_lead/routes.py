from flask import Blueprint, jsonify, request
from session_auth import login_required
from db import execute_query

domain_dashboard_bp = Blueprint("domain_dashboard", __name__, url_prefix="/api/domain-dashboard")


def _check_access(domain_id, user_id, role):
    if role in ("admin", "faculty"):
        return True
    lead = execute_query(
        "SELECT user_id FROM domain_leads WHERE domain_id=%s AND user_id=%s",
        (domain_id, user_id), fetch=True
    )
    return bool(lead)


@domain_dashboard_bp.route("/<int:domain_id>")
@login_required
def get_dashboard(domain_id):
    domain_rows = execute_query("SELECT id, name FROM domains WHERE id=%s", (domain_id,), fetch=True)
    if not domain_rows:
        return jsonify({"error": "Domain not found"}), 404

    if not _check_access(domain_id, request.user_id, request.role):
        return jsonify({"error": "Unauthorized"}), 403

    domain = domain_rows[0]
    lead_rows = execute_query("SELECT user_id FROM domain_leads WHERE domain_id=%s", (domain_id,), fetch=True)
    domain["lead_id"] = lead_rows[0]["user_id"] if lead_rows else None

    members = execute_query(
        """SELECT u.id, u.name, u.regno as registration_number
           FROM users u JOIN user_domains ud ON u.id=ud.user_id
           WHERE ud.domain_id=%s ORDER BY u.name""",
        (domain_id,), fetch=True
    ) or []

    requests_rows = execute_query(
        """SELECT djr.id, djr.user_id, djr.domain_id, djr.created_at,
                  u.name as user_name, u.regno as user_registration_number, u.email
           FROM domain_join_requests djr
           JOIN users u ON u.id=djr.user_id
           WHERE djr.domain_id=%s AND djr.status='pending'
           ORDER BY djr.created_at DESC""",
        (domain_id,), fetch=True
    ) or []
    for r in requests_rows:
        if r.get("created_at"):
            r["created_at"] = str(r["created_at"])

    return jsonify({"domain": domain, "members": members, "requests": requests_rows}), 200


@domain_dashboard_bp.route("/<int:domain_id>/members", methods=["POST"])
@login_required
def add_member(domain_id):
    if not _check_access(domain_id, request.user_id, request.role):
        return jsonify({"error": "Domain not found or unauthorized"}), 403

    data = request.get_json(silent=True) or {}
    regno = data.get("registration_number", "").strip()
    if not regno:
        return jsonify({"error": "Registration number is required"}), 400

    user_rows = execute_query("SELECT id, name, regno FROM users WHERE regno=%s", (regno,), fetch=True)
    if not user_rows:
        return jsonify({"error": "User with this registration number not found"}), 404

    target = user_rows[0]
    existing = execute_query(
        "SELECT 1 FROM user_domains WHERE user_id=%s AND domain_id=%s",
        (target["id"], domain_id), fetch=True
    )
    if existing:
        return jsonify({"error": "User is already a member"}), 400

    execute_query("INSERT IGNORE INTO user_domains (user_id, domain_id) VALUES (%s,%s)", (target["id"], domain_id))
    return jsonify({"message": "User added to domain", "member": {"id": target["id"], "name": target["name"], "registration_number": target["regno"]}}), 200


@domain_dashboard_bp.route("/<int:domain_id>/members/<int:target_user_id>", methods=["DELETE"])
@login_required
def remove_member(domain_id, target_user_id):
    if not _check_access(domain_id, request.user_id, request.role):
        return jsonify({"error": "Domain not found or unauthorized"}), 403

    lead_rows = execute_query("SELECT user_id FROM domain_leads WHERE domain_id=%s", (domain_id,), fetch=True)
    lead_id = lead_rows[0]["user_id"] if lead_rows else None
    if target_user_id == lead_id:
        return jsonify({"error": "Cannot remove the lead from their own domain"}), 400

    existing = execute_query(
        "SELECT 1 FROM user_domains WHERE user_id=%s AND domain_id=%s",
        (target_user_id, domain_id), fetch=True
    )
    if not existing:
        return jsonify({"error": "User is not a member of this domain"}), 400

    execute_query("DELETE FROM user_domains WHERE user_id=%s AND domain_id=%s", (target_user_id, domain_id))
    return jsonify({"message": "User removed from domain"}), 200


@domain_dashboard_bp.route("/<int:domain_id>/requests/<int:req_id>/accept", methods=["POST"])
@login_required
def accept_request(domain_id, req_id):
    if not _check_access(domain_id, request.user_id, request.role):
        return jsonify({"error": "Unauthorized"}), 403
    rows = execute_query(
        "SELECT user_id, domain_id FROM domain_join_requests WHERE id=%s AND domain_id=%s AND status='pending'",
        (req_id, domain_id), fetch=True
    )
    if not rows:
        return jsonify({"error": "Request not found"}), 404
    r = rows[0]
    execute_query("UPDATE domain_join_requests SET status='approved' WHERE id=%s", (req_id,))
    execute_query("INSERT IGNORE INTO user_domains (user_id, domain_id) VALUES (%s,%s)", (r["user_id"], r["domain_id"]))
    return jsonify({"message": "Request accepted"}), 200


@domain_dashboard_bp.route("/<int:domain_id>/requests/<int:req_id>/reject", methods=["POST"])
@login_required
def reject_request(domain_id, req_id):
    if not _check_access(domain_id, request.user_id, request.role):
        return jsonify({"error": "Unauthorized"}), 403
    rows = execute_query(
        "SELECT id FROM domain_join_requests WHERE id=%s AND domain_id=%s AND status='pending'",
        (req_id, domain_id), fetch=True
    )
    if not rows:
        return jsonify({"error": "Request not found"}), 404
    execute_query("UPDATE domain_join_requests SET status='rejected' WHERE id=%s", (req_id,))
    return jsonify({"message": "Request rejected"}), 200
