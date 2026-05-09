#!/bin/bash
# RekonStrike Unified Run Script

set -e

echo "🚀 Starting RekonStrike..."

# 1. Environment Detection
if [ -d ".venv" ]; then
    source .venv/bin/activate
elif [ -d "venv" ]; then
    source venv/bin/activate
else
    echo "⚠️  Virtual environment not found. Creating one..."
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
fi

# 2. UI Build Check
if [ ! -d "ui/dist" ]; then
    echo "📦 Building Frontend (first time)..."
    cd ui && npm install && npm run build && cd ..
fi

# 3. Database Check
export RS_DB_TYPE=${RS_DB_TYPE:-sqlite}
echo "🗄️  Using Database: $RS_DB_TYPE"

# 4. Start Server
export PYTHONPATH=$PYTHONPATH:$(pwd)/src
python3 -m rekonstrike serve --port 8000 --host 0.0.0.0
