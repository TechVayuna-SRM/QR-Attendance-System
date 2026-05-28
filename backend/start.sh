#!/bin/bash
cd "$(dirname "$0")"

# Kill anything on port 5001
lsof -ti:5001 | xargs kill -9 2>/dev/null
sleep 1

source venv/bin/activate
echo "✅ Virtual environment activated"
echo "✅ Starting Flask backend on http://localhost:5001"
python app.py
