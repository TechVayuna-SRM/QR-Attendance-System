import datetime
from datetime import timezone
from db import execute_query
from qr.utils import delete_qr_image
import os
from config import Config
from werkzeug.utils import secure_filename

def close_expired_sessions_and_mark_absent():
    """
    Identifies all active QR sessions that have expired, closes them,
    and inserts an 'absent' attendance record for all verified members
    who did not scan the QR code.
    """
    now = datetime.datetime.now(timezone.utc).astimezone()
    
    # 1. Find all active sessions that have expired
    expired_sessions = execute_query(
        "SELECT id, generated_at, generated_by, token, cloudinary_public_id FROM qr_sessions WHERE is_active=TRUE AND expires_at <= %s",
        (now,), fetch=True
    ) or []
    
    if not expired_sessions:
        return
        
    # 2. For each expired session, mark it inactive and insert 'absent' for unmarked verified users
    for session in expired_sessions:
        session_id = session["id"]
        generated_by = session["generated_by"]
        generated_at = session["generated_at"]
        
        # Get date part
        if isinstance(generated_at, datetime.datetime):
            session_date = generated_at.date()
        elif isinstance(generated_at, datetime.date):
            session_date = generated_at
        else:
            session_date = datetime.date.today()
            
        # Update is_active to FALSE
        execute_query(
            "UPDATE qr_sessions SET is_active=FALSE WHERE id=%s",
            (session_id,)
        )

        # Delete QR image from Cloudinary (and local disk)
        cloudinary_public_id = session.get("cloudinary_public_id")
        token = session.get("token")
        local_path = os.path.join(Config.QR_FOLDER, secure_filename(f"{token}.png")) if token else None
        if cloudinary_public_id:
            delete_qr_image(cloudinary_public_id, local_path)
        elif local_path and os.path.exists(local_path):
            os.remove(local_path)
        
        # Get all verified members and their domains
        members = execute_query(
            "SELECT u.id, ud.domain_id FROM users u JOIN user_domains ud ON u.id=ud.user_id WHERE u.is_verified=TRUE",
            fetch=True
        ) or []
        
        for m in members:
            execute_query(
                "INSERT IGNORE INTO attendance (user_id, domain_id, qr_session_id, status, date) VALUES (%s,%s,%s,'absent',%s)",
                (m["id"], m["domain_id"], session_id, session_date)
            )
            
        # Also ensure the session creator is marked absent for their domains if they didn't scan
        if generated_by:
            creator_domains = execute_query(
                "SELECT domain_id FROM user_domains WHERE user_id=%s",
                (generated_by,), fetch=True
            ) or []
            for d in creator_domains:
                execute_query(
                    "INSERT IGNORE INTO attendance (user_id, domain_id, qr_session_id, status, date) VALUES (%s,%s,%s,'absent',%s)",
                    (generated_by, d["domain_id"], session_id, session_date)
                )
