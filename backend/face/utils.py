import os
import base64
import tempfile
import numpy as np
import cv2
import requests
import cloudinary
import cloudinary.uploader
from io import BytesIO
from deepface import DeepFace
from config import Config

cloudinary.config(
    cloud_name=Config.CLOUDINARY_CLOUD_NAME,
    api_key=Config.CLOUDINARY_API_KEY,
    api_secret=Config.CLOUDINARY_API_SECRET,
)

def save_face_image(user_id, b64_image):
    """Decode base64 image, validate face present, upload to Cloudinary."""
    img_data = base64.b64decode(b64_image.split(",")[-1])
    np_arr = np.frombuffer(img_data, np.uint8)
    img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Invalid image data")

    faces = DeepFace.extract_faces(img_path=img, detector_backend="opencv", enforce_detection=True)
    if not faces:
        raise ValueError("No face detected in image")

    _, buffer = cv2.imencode(".jpg", img)
    result = cloudinary.uploader.upload(
        BytesIO(buffer.tobytes()),
        public_id=f"face_data/{int(user_id)}",
        resource_type="image",
        overwrite=True,
    )
    return result["secure_url"]

def _fetch_face_from_cloudinary(user_id):
    """Download face image from Cloudinary as a numpy array."""
    url = f"https://res.cloudinary.com/{Config.CLOUDINARY_CLOUD_NAME}/image/upload/face_data/{int(user_id)}.jpg"
    resp = requests.get(url, timeout=10)
    if resp.status_code != 200:
        raise FileNotFoundError("Face image not found in Cloudinary")
    np_arr = np.frombuffer(resp.content, np.uint8)
    img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Failed to decode face image from Cloudinary")
    return img

def verify_face(user_id, b64_image):
    """Compare live capture against registered face from Cloudinary. Returns True/False."""
    registered_img = _fetch_face_from_cloudinary(user_id)

    img_data = base64.b64decode(b64_image.split(",")[-1])
    np_arr = np.frombuffer(img_data, np.uint8)
    live_img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if live_img is None:
        raise ValueError("Invalid image data")

    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
        tmp_path = tmp.name
        cv2.imwrite(tmp_path, registered_img)

    try:
        result = DeepFace.verify(
            img1_path=live_img,
            img2_path=tmp_path,
            model_name="Facenet",
            detector_backend="opencv",
            enforce_detection=True
        )
    finally:
        os.remove(tmp_path)

    return result["verified"]
