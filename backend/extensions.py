import os
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_mail import Mail
from flask_jwt_extended import JWTManager
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_cors import CORS
from authlib.integrations.flask_client import OAuth

db      = SQLAlchemy()
migrate = Migrate()
mail    = Mail()
jwt     = JWTManager()
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=os.getenv("RATELIMIT_STORAGE_URI", "memory://")
)
cors    = CORS()
oauth   = OAuth()
