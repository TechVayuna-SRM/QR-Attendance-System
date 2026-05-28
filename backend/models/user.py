import uuid
import bcrypt
from datetime import datetime
from sqlalchemy import event
from extensions import db


# ── Association tables ────────────────────────────────────────────────────────

user_roles = db.Table(
    "user_roles",
    db.Column("user_id", db.String(36), db.ForeignKey("users_v2.id", ondelete="CASCADE"), primary_key=True),
    db.Column("role_id", db.Integer, db.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
)

user_domains = db.Table(
    "user_domains",
    db.Column("user_id", db.String(36), db.ForeignKey("users_v2.id", ondelete="CASCADE"), primary_key=True),
    db.Column("domain_id", db.Integer, db.ForeignKey("domains_v2.id", ondelete="CASCADE"), primary_key=True),
)


# ── User ──────────────────────────────────────────────────────────────────────

class User(db.Model):
    __tablename__ = "users_v2"

    id                  = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    google_id           = db.Column(db.String(255), unique=True, nullable=True, index=True)
    email               = db.Column(db.String(255), unique=True, nullable=False, index=True)
    name                = db.Column(db.String(255), nullable=False)
    avatar_url          = db.Column(db.String(500), nullable=True)
    is_verified         = db.Column(db.Boolean, default=False, nullable=False)
    is_active           = db.Column(db.Boolean, default=True, nullable=False)
    registration_number = db.Column(db.String(100), unique=True, nullable=True, index=True)
    year                = db.Column(db.String(50), nullable=True)
    department          = db.Column(db.String(100), nullable=True)
    section             = db.Column(db.String(50), nullable=True)
    is_approved         = db.Column(db.Boolean, default=False, nullable=False)
    face_registered     = db.Column(db.Boolean, default=False, nullable=False)
    created_at          = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at          = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    roles = db.relationship("Role", secondary=user_roles, backref=db.backref("users", lazy="dynamic"), lazy="select")
    domains = db.relationship("Domain", secondary=user_domains, backref=db.backref("users", lazy="dynamic"), lazy="select")
    otp_tokens = db.relationship("OTPToken", backref="user", lazy="dynamic", cascade="all, delete-orphan")

    def to_dict(self, include_roles=True, include_domains=True):
        data = {
            "id":                  self.id,
            "email":               self.email,
            "name":                self.name,
            "avatar_url":          self.avatar_url,
            "is_verified":         self.is_verified,
            "is_active":           self.is_active,
            "registration_number": self.registration_number,
            "year":                self.year,
            "department":          self.department,
            "section":             self.section,
            "is_approved":         self.is_approved,
            "face_registered":     self.face_registered,
            "created_at":          self.created_at.isoformat() if self.created_at else None,
            "updated_at":          self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_roles:
            data["roles"] = [r.name for r in self.roles]
        if include_domains:
            data["domains"] = [d.to_dict() for d in self.domains]
            data["led_domains"] = [d.to_dict() for d in self.led_domains]
        return data

    def has_role(self, *role_names):
        assigned = {r.name for r in self.roles}
        return bool(assigned.intersection(set(role_names)))

    def __repr__(self):
        return f"<User {self.email}>"


@event.listens_for(User, "before_update")
def prevent_face_registered_reset(mapper, connection, target):
    history = db.inspect(target).attrs.face_registered.history
    deleted = history.deleted
    added   = history.added
    if deleted and True in deleted and added and False in added:
        raise ValueError("face_registered cannot be reset after it has been set to True.")


# ── Role ──────────────────────────────────────────────────────────────────────

class Role(db.Model):
    __tablename__ = "roles"

    ADMIN       = "admin"
    DOMAIN_LEAD = "domain_lead"
    CLUB_MEMBER = "club_member"

    id          = db.Column(db.Integer, primary_key=True)
    name        = db.Column(db.String(50), unique=True, nullable=False)
    description = db.Column(db.String(255), nullable=True)

    def to_dict(self):
        return {"id": self.id, "name": self.name, "description": self.description}


# ── Domain ────────────────────────────────────────────────────────────────────

class Domain(db.Model):
    __tablename__ = "domains_v2"

    id          = db.Column(db.Integer, primary_key=True)
    name        = db.Column(db.String(100), nullable=False)
    slug        = db.Column(db.String(100), unique=True, nullable=False)
    description = db.Column(db.String(255), nullable=True)
    icon        = db.Column(db.String(10), nullable=True)
    lead_id     = db.Column(db.String(36), db.ForeignKey("users_v2.id", ondelete="SET NULL"), nullable=True)

    lead = db.relationship("User", backref="led_domains", foreign_keys=[lead_id])

    def to_dict(self):
        return {
            "id":          self.id,
            "name":        self.name,
            "description": self.description,
            "icon":        self.icon,
            "lead_id":     self.lead_id,
            "lead_name":   self.lead.name if self.lead else None,
        }


# ── Domain Join Request ───────────────────────────────────────────────────────

class DomainJoinRequest(db.Model):
    __tablename__ = "domain_join_requests"

    id         = db.Column(db.Integer, primary_key=True)
    user_id    = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    domain_id  = db.Column(db.Integer, db.ForeignKey("domains.id", ondelete="CASCADE"), nullable=False)
    status     = db.Column(db.String(20), default="pending", nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id":                       self.id,
            "user_id":                  self.user_id,
            "domain_id":                self.domain_id,
            "status":                   self.status,
            "created_at":               self.created_at.isoformat() if self.created_at else None,
        }


# ── OTP Token ─────────────────────────────────────────────────────────────────

class OTPToken(db.Model):
    __tablename__ = "otp_tokens"

    id         = db.Column(db.Integer, primary_key=True)
    user_id    = db.Column(db.String(36), db.ForeignKey("users_v2.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = db.Column(db.String(255), nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    used       = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def is_expired(self):
        return datetime.utcnow() > self.expires_at

    def is_valid(self):
        return not self.used and not self.is_expired()
