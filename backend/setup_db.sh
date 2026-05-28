#!/bin/bash
# Run this script once after filling in your .env file
# Usage: bash setup_db.sh

set -e

# Load .env
export $(grep -v '^#' .env | xargs)

echo "Creating database and tables..."
mysql -u "$DB_USER" -p"$DB_PASSWORD" < schema.sql
echo "✅ Database setup complete!"
