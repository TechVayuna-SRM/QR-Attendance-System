import os
import uuid
from datetime import datetime, timedelta, timezone
import qrcode
from werkzeug.utils import secure_filename
from config import Config

os.makedirs(Config.QR_FOLDER, exist_ok=True)

def is_within_session_window():
    now = datetime.now(timezone.utc).astimezone()  # local time
    if now.weekday() != Config.QR_SESSION_DAY:
        return False
    start = now.replace(hour=Config.QR_SESSION_START_HOUR, minute=Config.QR_SESSION_START_MIN, second=0, microsecond=0)
    end = now.replace(hour=Config.QR_SESSION_END_HOUR, minute=Config.QR_SESSION_END_MIN, second=0, microsecond=0)
    return start <= now <= end

def generate_qr_token():
    return str(uuid.uuid4())

def generate_qr_image(token):
    # token is a UUID — safe, but sanitize anyway
    filename = secure_filename(f"{token}.png")
    path = os.path.join(Config.QR_FOLDER, filename)
    if not os.path.realpath(path).startswith(os.path.realpath(Config.QR_FOLDER)):
        raise ValueError("Invalid token")
    img = qrcode.make(token)
    img.save(path)
    return path

def get_expiry():
    return datetime.now(timezone.utc).astimezone() + timedelta(minutes=Config.QR_VALID_MINUTES)
