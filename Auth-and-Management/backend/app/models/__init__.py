"""Re-export all models so 'from app.models import ...' works cleanly."""
from .user import User, Role, Domain, OTPToken, user_roles, user_domains  # noqa: F401
from .token_blacklist import TokenBlocklist  # noqa: F401
