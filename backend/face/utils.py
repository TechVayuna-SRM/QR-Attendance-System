import os
import base64
import numpy as np
import cv2
from werkzeug.utils import secure_filename
from deepface import DeepFace
from config import Config

os.makedirs(Config.FACE_UPLOAD_FOLDER, exist_ok=True)

def _safe_face_path(user_id):
    """Build a safe file path using only the integer user_id — prevents path traversal."""
    filename = secure_filename(f"{int(user_id)}.jpg")
    path = os.path.join(Config.FACE_UPLOAD_FOLDER, filename)
    # Ensure resolved path stays inside FACE_UPLOAD_FOLDER
    if not os.path.realpath(path).startswith(os.path.realpath(Config.FACE_UPLOAD_FOLDER)):
        raise ValueError("Invalid user_id")
    return path

def save_face_image(user_id, b64_image):
    """Decode base64 image, validate face present, save to disk."""
    img_data = base64.b64decode(b64_image.split(",")[-1])
    np_arr = np.frombuffer(img_data, np.uint8)
    img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Invalid image data")

    faces = DeepFace.extract_faces(img_path=img, detector_backend="opencv", enforce_detection=True)
    if not faces:
        raise ValueError("No face detected in image")

    path = _safe_face_path(user_id)
    cv2.imwrite(path, img)
    return path

def verify_face(user_id, b64_image):
    """Compare live capture against registered face. Returns True/False."""
    registered_path = _safe_face_path(user_id)
    if not os.path.exists(registered_path):
        raise FileNotFoundError("Face not registered")

    img_data = base64.b64decode(b64_image.split(",")[-1])
    np_arr = np.frombuffer(img_data, np.uint8)
    live_img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if live_img is None:
        raise ValueError("Invalid image data")

    result = DeepFace.verify(
        img1_path=live_img,
        img2_path=registered_path,
        model_name="Facenet",
        detector_backend="opencv",
        enforce_detection=True
    )
    return result["verified"]
