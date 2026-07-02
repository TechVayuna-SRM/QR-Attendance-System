import os
import json
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

# Load Google credentials from JSON file
_google_data = {"client_id": os.getenv("GOOGLE_CLIENT_ID", ""), "client_secret": os.getenv("GOOGLE_CLIENT_SECRET", "")}
_creds_path = os.path.join(os.path.dirname(__file__), os.getenv("GOOGLE_CREDENTIALS_FILE", "../google_credentials_react_project.json"))
if os.path.exists(_creds_path):
    try:
        with open(_creds_path) as f:
            _google = json.load(f)
            _google_data = _google.get("installed") or _google.get("web") or _google_data
    except Exception as e:
        print(f"⚠️ Warning: Could not load google_credentials_react_project.json: {e}")

class Config:
    SECRET_KEY = os.getenv("FLASK_SECRET", "fallback-secret")

    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_PORT = int(os.getenv("DB_PORT", 3306))
    DB_USER = os.getenv("DB_USER", "root")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "!@#$")
    DB_NAME = os.getenv("DB_NAME", "TV_DA_QR_BASED_ATTENDANCE_SYSTEM_FULL_PROJECT_DATABASE")

    MAIL_SERVER = os.getenv("MAIL_SERVER", "smtp.gmail.com")
    MAIL_PORT = int(os.getenv("MAIL_PORT", 587))
    MAIL_USE_TLS = True
    MAIL_USE_SSL = False
    MAIL_USERNAME = os.getenv("MAIL_USERNAME", "techvayuna2k19@gmail.com")
    MAIL_PASSWORD = os.getenv("MAIL_PASSWORD", "")
    MAIL_DEFAULT_SENDER = os.getenv("MAIL_DEFAULT_SENDER", os.getenv("MAIL_USERNAME", ""))

    # Google OAuth
    GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID") or _google_data.get("client_id", "")
    GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET") or _google_data.get("client_secret", "")
    OAUTH_REDIRECT_URI = os.getenv("OAUTH_REDIRECT_URI", "http://localhost:5001/api/auth/google/callback")
    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

    # JWT (HttpOnly cookies)
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", os.getenv("JWT_SECRET", "jwt-secret-please-change"))
    JWT_TOKEN_LOCATION = ["cookies"]
    JWT_COOKIE_HTTPONLY = True
    JWT_COOKIE_SECURE = False
    JWT_COOKIE_SAMESITE = "Lax"
    JWT_COOKIE_CSRF_PROTECT = False
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=2)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=7)

    FACE_UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "face_data")
    QR_FOLDER = os.path.join(os.path.dirname(__file__), "qr_codes")

    CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME", "")
    CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY", "")
    CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET", "")

    QR_VALID_MINUTES = 40
    QR_SESSION_START_HOUR = 12
    QR_SESSION_START_MIN = 40
    QR_SESSION_END_HOUR = 13
    QR_SESSION_END_MIN = 30
    QR_SESSION_DAY = 2
    BYPASS_QR_RESTRICTIONS = os.getenv("BYPASS_QR_RESTRICTIONS", "False") == "True"
