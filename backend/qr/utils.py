import os
import uuid
from datetime import datetime, timedelta, timezone
import qrcode
from werkzeug.utils import secure_filename
from config import Config

os.makedirs(Config.QR_FOLDER, exist_ok=True)

def is_within_session_window():
    if getattr(Config, "BYPASS_QR_RESTRICTIONS", False):
        return True
    
    # System local time matches Config session parameters (e.g. Wednesday 12:40 - 13:30)
    now = datetime.now()
    if now.weekday() != Config.QR_SESSION_DAY:
        return False
        
    current_minutes = now.hour * 60 + now.minute
    start_minutes = Config.QR_SESSION_START_HOUR * 60 + Config.QR_SESSION_START_MIN
    end_minutes = Config.QR_SESSION_END_HOUR * 60 + Config.QR_SESSION_END_MIN
    
    return start_minutes <= current_minutes <= end_minutes

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
    # QR code is valid for Config.QR_VALID_MINUTES (10 minutes)
    return datetime.now(timezone.utc).astimezone() + timedelta(minutes=Config.QR_VALID_MINUTES)
