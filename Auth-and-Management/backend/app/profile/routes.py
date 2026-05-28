"""
Profile blueprint routes.

Endpoints:
  GET  /api/profile/             → Get current user's profile
  PUT  /api/profile/edit         → Update name (email is immutable)
  PUT  /api/profile/domains      → Replace domain selections
  GET  /api/profile/domains/all  → List all available domains
  POST /api/profile/face         → One-time face registration flag (immutable)
"""
import os
from werkzeug.utils import secure_filename
from flask import jsonify, request, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity

from . import profile_bp
from ..auth.utils import verified_required, otp_required
from ..extensions import db
from ..models.user import Domain, User, DomainJoinRequest


# ── View Profile ──────────────────────────────────────────────────────────────

@profile_bp.route("/")
@jwt_required()
@verified_required
@otp_required
def get_profile():
    user: User | None = User.query.get(get_jwt_identity())
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify({"user": user.to_dict()}), 200


# ── Edit Profile ──────────────────────────────────────────────────────────────

@profile_bp.route("/edit", methods=["PUT"])
@jwt_required()
@verified_required
@otp_required
def edit_profile():
    """
    Allow users to update their name only.
    email is sourced from Google and cannot be changed.
    face_registered is intentionally excluded — set via /face endpoint.
    """
    user: User | None = User.query.get(get_jwt_identity())
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json(silent=True) or {}

    # Whitelist of mutable fields
    if "name" in data:
        name = str(data["name"]).strip()
        if not name:
            return jsonify({"error": "Name cannot be empty"}), 400
        if len(name) > 255:
            return jsonify({"error": "Name is too long (max 255 characters)"}), 400
        user.name = name

    if "year" in data:
        user.year = str(data["year"]).strip()
    
    if "department" in data:
        user.department = str(data["department"]).strip()

    if "section" in data:
        user.section = str(data["section"]).strip()

    if "avatar_url" in data:
        user.avatar_url = str(data["avatar_url"]).strip()

    # Guard: silently ignore attempts to change email or face_registered
    # Role changes go through the admin blueprint only
    db.session.commit()
    return jsonify({"message": "Profile updated", "user": user.to_dict()}), 200


# ── Avatar Upload ─────────────────────────────────────────────────────────────

@profile_bp.route("/avatar", methods=["POST"])
@jwt_required()
@verified_required
@otp_required
def upload_avatar():
    """Upload a new profile picture (PNG only)."""
    user: User | None = User.query.get(get_jwt_identity())
    if not user:
        return jsonify({"error": "User not found"}), 404

    if 'file' not in request.files:
        return jsonify({"error": "No file part in the request"}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
        
    if file and file.filename.lower().endswith('.png'):
        filename = secure_filename(f"user_{user.id}_{file.filename}")
        # Ensure directory exists
        upload_folder = os.path.join(current_app.root_path, 'static', 'avatars')
        os.makedirs(upload_folder, exist_ok=True)
        
        filepath = os.path.join(upload_folder, filename)
        file.save(filepath)
        
        # Update user avatar_url
        avatar_url = f"/static/avatars/{filename}"
        user.avatar_url = avatar_url
        db.session.commit()
        
        return jsonify({"message": "Avatar updated successfully", "avatar_url": avatar_url}), 200
    else:
        return jsonify({"error": "Only PNG files are allowed"}), 400


# ── Domain Selection ──────────────────────────────────────────────────────────

@profile_bp.route("/domains", methods=["PUT"])
@jwt_required()
@verified_required
@otp_required
def update_domains():
    """Replace the user's domain selections with the provided list of domain IDs."""
    user: User | None = User.query.get(get_jwt_identity())
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json(silent=True) or {}
    if "domain_ids" not in data:
        return jsonify({"error": "domain_ids is required"}), 400

    domain_ids = data["domain_ids"]
    if not isinstance(domain_ids, list):
        return jsonify({"error": "domain_ids must be a list of integers"}), 400

    if len(domain_ids) > 10:
        return jsonify({"error": "You may select up to 10 domains"}), 400

    target_domain_ids = set(domain_ids)
    
    # Ensure lead domains are ALWAYS included in target domains
    led_domains = Domain.query.filter_by(lead_id=user.id).all()
    for ld in led_domains:
        target_domain_ids.add(ld.id)

    # Calculate removals: currently in user.domains but NOT in target_domain_ids
    current_domain_ids = {d.id for d in user.domains}
    to_remove_ids = current_domain_ids - target_domain_ids

    # Remove users from domains they no longer want
    new_domains_list = [d for d in user.domains if d.id not in to_remove_ids]
    user.domains = new_domains_list

    # Calculate additions (requested domains that user is NOT already in)
    new_requested_ids = target_domain_ids - current_domain_ids

    if new_requested_ids:
        for r_id in new_requested_ids:
            # Check if pending request already exists
            existing_req = DomainJoinRequest.query.filter_by(user_id=user.id, domain_id=r_id, status="pending").first()
            if not existing_req:
                req = DomainJoinRequest(user_id=user.id, domain_id=r_id, status="pending")
                db.session.add(req)

    # If the user deselected domains that were only "pending", remove those pending requests
    pending_reqs = DomainJoinRequest.query.filter_by(user_id=user.id, status="pending").all()
    for req in pending_reqs:
        if req.domain_id not in target_domain_ids:
            db.session.delete(req)

    db.session.commit()
    
    updated_pending = DomainJoinRequest.query.filter_by(user_id=user.id, status="pending").all()
    
    return jsonify({
        "message": "Domain preferences updated. New domains require approval.",
        "domains": [d.to_dict() for d in user.domains],
        "pending_requests": [req.to_dict() for req in updated_pending]
    }), 200


@profile_bp.route("/domains/all")
@jwt_required()
def get_all_domains():
    """Return all available domains for the domain-selection UI."""
    domains = Domain.query.order_by(Domain.name).all()
    return jsonify({"domains": [d.to_dict() for d in domains]}), 200


@profile_bp.route("/requests")
@jwt_required()
@verified_required
@otp_required
def get_my_requests():
    """Return the current user's pending domain join requests."""
    user_id = get_jwt_identity()
    requests = DomainJoinRequest.query.filter_by(user_id=user_id, status="pending").all()
    return jsonify({"requests": [r.to_dict() for r in requests]}), 200


# ── Face Registration (one-time, immutable) ───────────────────────────────────

@profile_bp.route("/face", methods=["POST"])
@jwt_required()
@verified_required
@otp_required
def register_face():
    """
    Called by the QR/facial-recognition module to flag that facial data
    has been collected for this user.  Can only be set once — the SQLAlchemy
    before_update event prevents resetting it to False.
    """
    user: User | None = User.query.get(get_jwt_identity())
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.face_registered:
        return jsonify({
            "error": "Facial data already registered. This cannot be modified.",
            "face_registered": True,
        }), 409

    user.face_registered = True
    db.session.commit()
    return jsonify({
        "message": "Face registered successfully",
        "face_registered": True,
    }), 200
