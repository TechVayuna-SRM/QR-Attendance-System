"""
Flask application factory.
All extension initialization and blueprint registration live here.
"""
import os
from flask import Flask, jsonify
from .config import config_map
from .extensions import db, migrate, mail, jwt, limiter, cors, oauth


def create_app(config_name: str | None = None) -> Flask:
    if config_name is None:
        config_name = os.environ.get("FLASK_ENV", "development")

    app = Flask(__name__)
    app.config.from_object(config_map.get(config_name, config_map["development"]))

    # ── Extensions ────────────────────────────────────────────────────────────
    db.init_app(app)
    migrate.init_app(app, db)
    mail.init_app(app)
    jwt.init_app(app)
    limiter.init_app(app)

    cors.init_app(
        app,
        origins=[app.config["FRONTEND_URL"]],
        supports_credentials=True,
        allow_headers=["Content-Type", "X-CSRF-TOKEN", "Authorization"],
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        expose_headers=["Set-Cookie"],
    )

    oauth.init_app(app)

    # ── Google OAuth registration ─────────────────────────────────────────────
    oauth.register(
        name="google",
        client_id=app.config["GOOGLE_CLIENT_ID"],
        client_secret=app.config["GOOGLE_CLIENT_SECRET"],
        server_metadata_url=(
            "https://accounts.google.com/.well-known/openid-configuration"
        ),
        client_kwargs={
            "scope": "openid email profile",
            "prompt": "select_account",
        },
    )

    # ── Import models so SQLAlchemy registers them before migrations ──────────
    from .models import user, token_blacklist  # noqa: F401

    # ── JWT Blocklist handler ─────────────────────────────────────────────────
    from .models.token_blacklist import TokenBlocklist

    @jwt.token_in_blocklist_loader
    def check_if_token_revoked(jwt_header, jwt_payload: dict) -> bool:
        jti = jwt_payload["jti"]
        return db.session.query(
            TokenBlocklist.query.filter_by(jti=jti).exists()
        ).scalar()

    # ── JWT error handlers (return JSON, not HTML) ────────────────────────────
    @jwt.unauthorized_loader
    def missing_token_callback(reason):
        return jsonify({"error": "Authentication required", "reason": reason}), 401

    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        return jsonify({"error": "Token has expired", "code": "token_expired"}), 401

    @jwt.invalid_token_loader
    def invalid_token_callback(reason):
        return jsonify({"error": "Invalid token", "reason": reason}), 422

    @jwt.revoked_token_loader
    def revoked_token_callback(jwt_header, jwt_payload):
        return jsonify({"error": "Token has been revoked"}), 401

    # ── Blueprints ────────────────────────────────────────────────────────────
    from .auth import auth_bp
    from .profile import profile_bp
    from .admin import admin_bp
    from .domain_lead.routes import domain_dashboard_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(profile_bp, url_prefix="/api/profile")
    app.register_blueprint(admin_bp, url_prefix="/api/admin")
    app.register_blueprint(domain_dashboard_bp)

    # ── Health check ──────────────────────────────────────────────────────────
    @app.route("/api/health")
    def health():
        return jsonify({"status": "ok", "service": "QR Attendance API"}), 200

    # ── CLI commands ──────────────────────────────────────────────────────────
    from .cli import register_commands
    register_commands(app)

    # ── CREATE TABLES (FIX FOR YOUR ERROR) ────────────────────────────────────
    with app.app_context():
        db.create_all()
    return app
