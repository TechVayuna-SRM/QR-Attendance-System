import os
from flask import Flask, jsonify
from flask_cors import CORS
from flask_mail import Mail
from flask_jwt_extended import JWTManager
from config import Config

# Legacy mail/jwt instances (used by auth/routes.py directly)
mail = Mail()
jwt  = JWTManager()


def create_app():
    app = Flask(__name__)
    app.secret_key = Config.SECRET_KEY

    # ── Mail ──────────────────────────────────────────────────────────────────
    app.config["MAIL_SERVER"]         = Config.MAIL_SERVER
    app.config["MAIL_PORT"]           = Config.MAIL_PORT
    app.config["MAIL_USE_TLS"]        = Config.MAIL_USE_TLS
    app.config["MAIL_USERNAME"]       = Config.MAIL_USERNAME
    app.config["MAIL_PASSWORD"]       = Config.MAIL_PASSWORD
    app.config["MAIL_DEFAULT_SENDER"] = Config.MAIL_DEFAULT_SENDER

    IS_PRODUCTION = os.getenv("RENDER", "false").lower() == "true"

    # ── JWT (HttpOnly cookies) ────────────────────────────────────────────────
    app.config["JWT_SECRET_KEY"]          = Config.JWT_SECRET_KEY
    app.config["JWT_TOKEN_LOCATION"]      = ["cookies"]
    app.config["JWT_COOKIE_HTTPONLY"]     = True
    app.config["JWT_COOKIE_SECURE"]       = IS_PRODUCTION
    app.config["JWT_COOKIE_SAMESITE"]     = "None" if IS_PRODUCTION else "Lax"
    app.config["JWT_COOKIE_CSRF_PROTECT"] = False
    app.config["JWT_ACCESS_TOKEN_EXPIRES"]  = Config.JWT_ACCESS_TOKEN_EXPIRES
    app.config["JWT_REFRESH_TOKEN_EXPIRES"] = Config.JWT_REFRESH_TOKEN_EXPIRES

    # ── SQLAlchemy ────────────────────────────────────────────────────────────
    app.config["SQLALCHEMY_DATABASE_URI"] = (
        f"mysql+pymysql://{Config.DB_USER}:{Config.DB_PASSWORD}"
        f"@{Config.DB_HOST}:{Config.DB_PORT}/{Config.DB_NAME}"
    )
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
        "pool_recycle": 300,
        "pool_pre_ping": True,
        "pool_size": 10,
        "max_overflow": 20,
    }

    # ── Google OAuth ──────────────────────────────────────────────────────────
    app.config["GOOGLE_CLIENT_ID"]     = Config.GOOGLE_CLIENT_ID
    app.config["GOOGLE_CLIENT_SECRET"] = Config.GOOGLE_CLIENT_SECRET
    app.config["OAUTH_REDIRECT_URI"]   = Config.OAUTH_REDIRECT_URI
    app.config["FRONTEND_URL"]         = Config.FRONTEND_URL

    # ── Session cookie ────────────────────────────────────────────────────────
    app.config["SESSION_COOKIE_SAMESITE"] = "None" if IS_PRODUCTION else "Lax"
    app.config["SESSION_COOKIE_SECURE"]   = IS_PRODUCTION
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_DOMAIN"]   = None

    # ── CORS ──────────────────────────────────────────────────────────────────
    CORS(app, resources={r"/api/*": {
        "origins": Config.FRONTEND_URL,
        "supports_credentials": True,
        "allow_headers": ["Content-Type", "Authorization", "X-CSRF-TOKEN"],
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "expose_headers": ["Set-Cookie"],
    }}, always_send=True)

    # ── Extensions ────────────────────────────────────────────────────────────
    mail.init_app(app)
    jwt.init_app(app)

    # SQLAlchemy + Migrate (new)
    from extensions import db, migrate, limiter
    db.init_app(app)
    migrate.init_app(app, db)
    limiter.init_app(app)

    # ── JWT error handlers ────────────────────────────────────────────────────
    @jwt.unauthorized_loader
    def missing_token_callback(reason):
        return jsonify({"error": "Authentication required", "reason": reason}), 401

    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        return jsonify({"error": "Token has expired", "code": "token_expired"}), 401

    @jwt.invalid_token_loader
    def invalid_token_callback(reason):
        return jsonify({"error": "Invalid token", "reason": reason}), 422

    # ── JWT blocklist (new) ───────────────────────────────────────────────────
    from models.token_blacklist import TokenBlocklist

    @jwt.token_in_blocklist_loader
    def check_if_token_revoked(jwt_header, jwt_payload):
        jti = jwt_payload["jti"]
        return db.session.query(
            TokenBlocklist.query.filter_by(jti=jti).exists()
        ).scalar()

    @jwt.revoked_token_loader
    def revoked_token_callback(jwt_header, jwt_payload):
        return jsonify({"error": "Token has been revoked"}), 401

    # ── Import models so SQLAlchemy registers them ────────────────────────────
    from models import user, token_blacklist  # noqa: F401

    # ── Blueprints ────────────────────────────────────────────────────────────
    from auth.routes import auth_bp, init_oauth
    from attendance.routes import attendance_bp
    from analytics.routes import analytics_bp
    from admin import admin_bp
    from profile import profile_bp
    from domain_lead.routes import domain_dashboard_bp

    init_oauth(app)

    app.register_blueprint(auth_bp,             url_prefix="/api/auth")
    app.register_blueprint(attendance_bp,        url_prefix="/api/attendance")
    app.register_blueprint(analytics_bp,         url_prefix="/api/analytics")
    app.register_blueprint(admin_bp,             url_prefix="/api/admin")
    app.register_blueprint(profile_bp,           url_prefix="/api/profile")
    app.register_blueprint(domain_dashboard_bp)

    # ── Health check ──────────────────────────────────────────────────────────
    @app.route("/api/health")
    def health():
        return jsonify({"status": "ok", "service": "QR Attendance API"}), 200

    # ── Create new SQLAlchemy tables ──────────────────────────────────────────
    with app.app_context():
        db.create_all()

    return app


app = create_app()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port)