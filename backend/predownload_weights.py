import os
import urllib.request
from pathlib import Path

def download_weights():
    home = str(Path.home())
    weights_dir = os.path.join(home, ".deepface", "weights")
    os.makedirs(weights_dir, exist_ok=True)
    
    weights_path = os.path.join(weights_dir, "facenet_weights.h5")
    
    url = "https://github.com/serengil/deepface_models/releases/download/v1.0/facenet_weights.h5"
    
    if not os.path.exists(weights_path):
        print(f"Downloading Facenet weights from {url} to {weights_path}...")
        try:
            urllib.request.urlretrieve(url, weights_path)
            print("✅ Facenet weights download complete.")
        except Exception as e:
            print(f"❌ Failed to download weights: {e}")
            raise e
    else:
        print("✅ Facenet weights already present.")

if __name__ == "__main__":
    download_weights()
