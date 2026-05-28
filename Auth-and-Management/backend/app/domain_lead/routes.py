"""
Domain Dashboard blueprint routes.
Provides domain-specific management to Admins and the specific Domain Lead.

Endpoints:
  GET  /api/domain-dashboard/<id>                     → Get domain stats, members, and pending requests
  POST /api/domain-dashboard/<id>/members             → Add a member manually (by email)
  DELETE /api/domain-dashboard/<id>/members/<uid>     → Remove a member
  POST /api/domain-dashboard/<id>/requests/<req_id>/accept → Accept join request
  POST /api/domain-dashboard/<id>/requests/<req_id>/reject → Reject join request
"""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from ..extensions import db
from ..models.user import Domain, User, DomainJoinRequest

domain_dashboard_bp = Blueprint("domain_dashboard", __name__, url_prefix="/api/domain-dashboard")

def check_access(domain, user):
    """Return True if user is Admin or the Lead of this Domain."""
    if not domain:
        return False
    if user.has_role("admin"):
        return True
    if domain.lead_id == user.id:
        return True
    return False

@domain_dashboard_bp.route("/<int:domain_id>")
@jwt_required()
def get_dashboard(domain_id: int):
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    domain = Domain.query.get(domain_id)
    
    if not domain:
        return jsonify({"error": "Domain not found"}), 404
        
    if not check_access(domain, user):
        return jsonify({"error": "Unauthorized"}), 403

    members = [{"id": u.id, "name": u.name, "registration_number": u.registration_number, "avatar_url": u.avatar_url} for u in domain.users]
    
    # Sort so the lead is at the top
    members.sort(key=lambda m: 0 if m["id"] == domain.lead_id else 1)

    pending_requests = DomainJoinRequest.query.filter_by(domain_id=domain.id, status="pending").order_by(DomainJoinRequest.created_at).all()
    requests_data = [req.to_dict() for req in pending_requests]

    return jsonify({
        "domain": domain.to_dict(),
        "members": members,
        "requests": requests_data
    }), 200


@domain_dashboard_bp.route("/<int:domain_id>/members", methods=["POST"])
@jwt_required()
def add_member(domain_id: int):
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    domain = Domain.query.get(domain_id)
    
    if not check_access(domain, user):
        return jsonify({"error": "Domain not found or unauthorized"}), 403

    data = request.get_json(silent=True) or {}
    registration_number = data.get("registration_number", "").strip()
    
    if not registration_number:
        return jsonify({"error": "Registration number is required"}), 400

    target_user = User.query.filter_by(registration_number=registration_number).first()
    if not target_user:
        return jsonify({"error": "User with this registration number not found"}), 404

    if domain in target_user.domains:
        return jsonify({"error": "User is already a member"}), 400

    target_user.domains.append(domain)
    
    # Auto-resolve any pending request they might have had
    req = DomainJoinRequest.query.filter_by(domain_id=domain.id, user_id=target_user.id, status="pending").first()
    if req:
        req.status = "accepted"

    db.session.commit()

    return jsonify({
        "message": "User added to domain",
        "member": {
            "id": target_user.id,
            "name": target_user.name,
            "registration_number": target_user.registration_number,
            "avatar_url": target_user.avatar_url
        }
    }), 200


@domain_dashboard_bp.route("/<int:domain_id>/members/<string:target_user_id>", methods=["DELETE"])
@jwt_required()
def remove_member(domain_id: int, target_user_id: str):
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    domain = Domain.query.get(domain_id)
    
    if not check_access(domain, user):
        return jsonify({"error": "Domain not found or unauthorized"}), 403

    target_user = User.query.get(target_user_id)
    if not target_user:
        return jsonify({"error": "User not found"}), 404

    if domain not in target_user.domains:
        return jsonify({"error": "User is not a member of this domain"}), 400

    # Prevent removing the lead from their own domain
    if target_user.id == domain.lead_id:
        return jsonify({"error": "Cannot remove the lead from their own domain"}), 400

    target_user.domains.remove(domain)
    db.session.commit()

    return jsonify({"message": "User removed from domain"}), 200


@domain_dashboard_bp.route("/<int:domain_id>/requests/<int:req_id>/accept", methods=["POST"])
@jwt_required()
def accept_request(domain_id: int, req_id: int):
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    domain = Domain.query.get(domain_id)
    
    if not check_access(domain, user):
        return jsonify({"error": "Unauthorized"}), 403

    req = DomainJoinRequest.query.get(req_id)
    if not req or req.domain_id != domain_id:
        return jsonify({"error": "Request not found"}), 404

    if req.status != "pending":
        return jsonify({"error": "Request is not pending"}), 400

    target_user = User.query.get(req.user_id)
    if not target_user:
        return jsonify({"error": "Requesting user no longer exists"}), 404

    req.status = "accepted"
    if domain not in target_user.domains:
        target_user.domains.append(domain)
        
    db.session.commit()
    return jsonify({"message": "Request accepted"}), 200


@domain_dashboard_bp.route("/<int:domain_id>/requests/<int:req_id>/reject", methods=["POST"])
@jwt_required()
def reject_request(domain_id: int, req_id: int):
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    domain = Domain.query.get(domain_id)
    
    if not check_access(domain, user):
        return jsonify({"error": "Unauthorized"}), 403

    req = DomainJoinRequest.query.get(req_id)
    if not req or req.domain_id != domain_id:
        return jsonify({"error": "Request not found"}), 404

    if req.status != "pending":
        return jsonify({"error": "Request is not pending"}), 400

    req.status = "rejected"
    # Actually, we can just delete it so they can try again if it was a mistake, or mark it rejected
    # For now, let's just delete the request completely to keep the queue clean
    db.session.delete(req)
    db.session.commit()
    
    return jsonify({"message": "Request rejected and removed"}), 200
