"""
SQLAlchemy models: User, Role, Domain, OTPToken + association tables.

Security note for face_registered:
  A SQLAlchemy before_update event prevents setting face_registered back
  to False once it has been set to True, making facial data registration
  effectively immutable.
"""
import uuid
import bcrypt
from datetime import datetime
from sqlalchemy import event
from ..extensions import db


# ── Association tables (many-to-many) ─────────────────────────────────────────

user_roles = db.Table(
    "user_roles",
    db.Column(
        "user_id",
        db.String(36),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    db.Column(
        "role_id",
        db.Integer,
        db.ForeignKey("roles.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)

user_domains = db.Table(
    "user_domains",
    db.Column(
        "user_id",
        db.String(36),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    db.Column(
        "domain_id",
        db.Integer,
        db.ForeignKey("domains.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


# ── User ──────────────────────────────────────────────────────────────────────

class User(db.Model):
    __tablename__ = "users"

    id          = db.Column(db.String(36),  primary_key=True, default=lambda: str(uuid.uuid4()))
    google_id   = db.Column(db.String(255), unique=True, nullable=True,  index=True)
    email       = db.Column(db.String(255), unique=True, nullable=False, index=True)
    name        = db.Column(db.String(255), nullable=False)
    avatar_url  = db.Column(db.String(500), nullable=True)
    is_verified = db.Column(db.Boolean,     default=False, nullable=False)
    is_active   = db.Column(db.Boolean,     default=True,  nullable=False)
    
    # Onboarding details
    registration_number = db.Column(db.String(100), unique=True, nullable=True, index=True)
    year                = db.Column(db.String(50), nullable=True)
    department          = db.Column(db.String(100), nullable=True)
    section             = db.Column(db.String(50), nullable=True)
    is_approved         = db.Column(db.Boolean, default=False, nullable=False)

    # Immutable once True — enforced by the before_update event below
    face_registered = db.Column(db.Boolean, default=False, nullable=False)

    created_at  = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at  = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    roles = db.relationship(
        "Role",
        secondary=user_roles,
        backref=db.backref("users", lazy="dynamic"),
        lazy="select",
    )
    domains = db.relationship(
        "Domain",
        secondary=user_domains,
        backref=db.backref("users", lazy="dynamic"),
        lazy="select",
    )
    otp_tokens = db.relationship(
        "OTPToken",
        backref="user",
        lazy="dynamic",
        cascade="all, delete-orphan",
    )

    # ── Serialization ─────────────────────────────────────────────────────────

    def to_dict(self, include_roles: bool = True, include_domains: bool = True) -> dict:
        data: dict = {
            "id":              self.id,
            "email":           self.email,
            "name":            self.name,
            "avatar_url":      self.avatar_url,
            "is_verified":     self.is_verified,
            "is_active":       self.is_active,
            "registration_number": self.registration_number,
            "year":            self.year,
            "department":      self.department,
            "section":         self.section,
            "is_approved":     self.is_approved,
            "face_registered": self.face_registered,
            "created_at":      self.created_at.isoformat() if self.created_at else None,
            "updated_at":      self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_roles:
            data["roles"] = [r.name for r in self.roles]
        if include_domains:
            data["domains"] = [d.to_dict() for d in self.domains]
            # Include led domains so frontend can render nav appropriately
            data["led_domains"] = [d.to_dict() for d in self.led_domains]
        return data

    # ── RBAC helpers ──────────────────────────────────────────────────────────

    def has_role(self, *role_names: str) -> bool:
        """Return True if the user has at least one of the given roles."""
        assigned = {r.name for r in self.roles}
        return bool(assigned.intersection(set(role_names)))

    def __repr__(self) -> str:
        return f"<User {self.email}>"


# ── Immutability guard for face_registered ────────────────────────────────────

@event.listens_for(User, "before_update")
def prevent_face_registered_reset(mapper, connection, target) -> None:
    """
    Block any attempt to flip face_registered from True → False.
    Raises ValueError which SQLAlchemy surfaces as an IntegrityError-like
    exception before the UPDATE is issued.
    """
    history = db.inspect(target).attrs.face_registered.history
    deleted = history.deleted   # old values being replaced
    added   = history.added     # new values being written

    if deleted and True in deleted and added and False in added:
        raise ValueError(
            "face_registered cannot be reset after it has been set to True. "
            "Facial data registration is immutable."
        )


# ── Role ──────────────────────────────────────────────────────────────────────

class Role(db.Model):
    __tablename__ = "roles"

    # Role name constants
    ADMIN       = "admin"
    DOMAIN_LEAD = "domain_lead"
    CLUB_MEMBER = "club_member"

    id          = db.Column(db.Integer,    primary_key=True)
    name        = db.Column(db.String(50), unique=True, nullable=False)
    description = db.Column(db.String(255), nullable=True)

    def to_dict(self) -> dict:
        return {"id": self.id, "name": self.name, "description": self.description}

    def __repr__(self) -> str:
        return f"<Role {self.name}>"


# ── Domain ────────────────────────────────────────────────────────────────────

class Domain(db.Model):
    __tablename__ = "domains"

    id          = db.Column(db.Integer,    primary_key=True)
    name        = db.Column(db.String(100), nullable=False)
    slug        = db.Column(db.String(100), unique=True, nullable=False)
    description = db.Column(db.String(255), nullable=True)
    icon        = db.Column(db.String(10),  nullable=True)   # emoji
    lead_id     = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    lead = db.relationship("User", backref="led_domains", foreign_keys=[lead_id])

    def to_dict(self) -> dict:
        return {
            "id":          self.id,
            "name":        self.name,
            "description": self.description,
            "icon":        self.icon,
            "lead_id":     self.lead_id,
            "lead_name":   self.lead.name if self.lead else None,
        }

    def __repr__(self) -> str:
        return f"<Domain {self.name}>"


# ── Domain Join Request ───────────────────────────────────────────────────────

class DomainJoinRequest(db.Model):
    __tablename__ = "domain_join_requests"

    id         = db.Column(db.Integer, primary_key=True)
    user_id    = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    domain_id  = db.Column(db.Integer, db.ForeignKey("domains.id", ondelete="CASCADE"), nullable=False)
    status     = db.Column(db.String(20), default="pending", nullable=False) # pending, accepted, rejected
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user   = db.relationship("User", backref=db.backref("join_requests", cascade="all, delete-orphan", lazy="dynamic"))
    domain = db.relationship("Domain", backref=db.backref("join_requests", cascade="all, delete-orphan", lazy="dynamic"))

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "domain_id": self.domain_id,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "user_name": self.user.name if self.user else None,
            "user_registration_number": self.user.registration_number if self.user else None,
            "domain_name": self.domain.name if self.domain else None
        }

    def __repr__(self) -> str:
        return f"<DomainJoinRequest user_id={self.user_id} domain_id={self.domain_id} status={self.status}>"


# ── OTP Token ─────────────────────────────────────────────────────────────────

class OTPToken(db.Model):
    __tablename__ = "otp_tokens"

    id          = db.Column(db.Integer, primary_key=True)
    user_id     = db.Column(
        db.String(36),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash  = db.Column(db.String(255), nullable=False)   # bcrypt hash
    expires_at  = db.Column(db.DateTime,    nullable=False)
    used        = db.Column(db.Boolean,     default=False, nullable=False)
    created_at  = db.Column(db.DateTime,    default=datetime.utcnow)

    def is_expired(self) -> bool:
        return datetime.utcnow() > self.expires_at

    def is_valid(self) -> bool:
        return not self.used and not self.is_expired()

    def __repr__(self) -> str:
        return f"<OTPToken user_id={self.user_id} used={self.used}>"
