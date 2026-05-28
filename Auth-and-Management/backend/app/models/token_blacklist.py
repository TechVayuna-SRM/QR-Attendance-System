"""
JWT token blocklist for supporting logout / token revocation.
When a user logs out, their access or refresh token JTI is stored here.
The app factory registers the token_in_blocklist_loader against this table.
"""
from datetime import datetime
from ..extensions import db


class TokenBlocklist(db.Model):
    __tablename__ = "jwt_token_blocklist"

    id          = db.Column(db.Integer,    primary_key=True)
    jti         = db.Column(db.String(36), nullable=False, unique=True, index=True)
    token_type  = db.Column(db.String(20), nullable=False)   # "access" | "refresh"
    created_at  = db.Column(db.DateTime,   default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<TokenBlocklist jti={self.jti} type={self.token_type}>"
