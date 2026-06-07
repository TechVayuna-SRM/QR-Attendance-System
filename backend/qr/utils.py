import os
import uuid
from datetime import datetime, timedelta, timezone
import qrcode
import cloudinary
import cloudinary.uploader
from io import BytesIO
from werkzeug.utils import secure_filename
from config import Config

os.makedirs(Config.QR_FOLDER, exist_ok=True)

cloudinary.config(
    cloud_name=Config.CLOUDINARY_CLOUD_NAME,
    api_key=Config.CLOUDINARY_API_KEY,
    api_secret=Config.CLOUDINARY_API_SECRET,
)

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
    """Upload QR image to Cloudinary and return (local_path, cloudinary_public_id, cloudinary_url)."""
    filename = secure_filename(f"{token}.png")
    local_path = os.path.join(Config.QR_FOLDER, filename)
    if not os.path.realpath(local_path).startswith(os.path.realpath(Config.QR_FOLDER)):
        raise ValueError("Invalid token")
    img = qrcode.make(token)
    img.save(local_path)

    # Upload to Cloudinary
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    result = cloudinary.uploader.upload(
        buffer,
        public_id=f"qr_codes/{token}",
        resource_type="image",
        overwrite=True,
    )
    return local_path, result["public_id"], result["secure_url"]

def delete_qr_image(cloudinary_public_id, local_path=None):
    """Delete QR image from Cloudinary and optionally from local disk."""
    try:
        cloudinary.uploader.destroy(cloudinary_public_id, resource_type="image")
    except Exception as e:
        print(f"⚠️ Cloudinary delete failed for {cloudinary_public_id}: {e}")
    if local_path and os.path.exists(local_path):
        os.remove(local_path)

def get_expiry():
    # QR code is valid for Config.QR_VALID_MINUTES (10 minutes)
    return datetime.now(timezone.utc).astimezone() + timedelta(minutes=Config.QR_VALID_MINUTES)
