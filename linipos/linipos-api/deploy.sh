#!/bin/bash
# deploy.sh — Lini POS API deployment script
# Usage: bash deploy.sh
set -e

echo "=== Lini POS API — Deploy ==="

# 1. Install production dependencies
echo "[1/5] Installing dependencies..."
npm ci --omit=dev

# 2. Build TypeScript
echo "[2/5] Building TypeScript..."
npm run build

# 3. Create logs directory
echo "[3/5] Creating logs directory..."
mkdir -p logs

# 4. Run database migration (requires DB_* env vars to be set)
echo "[4/5] Running database migration..."
if [ -f ".env" ]; then
  export $(grep -v '^#' .env | xargs)
fi
mysql -h "${DB_HOST:-localhost}" -P "${DB_PORT:-3306}" -u "${DB_USER}" -p"${DB_PASSWORD}" "${DB_NAME}" < migrations/001_initial_schema.sql
echo "Migration complete."

# 5. Start or reload PM2
echo "[5/5] Starting/reloading PM2..."
if pm2 describe linipos-api > /dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
  echo "PM2 process reloaded."
else
  pm2 start ecosystem.config.cjs
  echo "PM2 process started."
fi

pm2 save

echo ""
echo "✅ Deploy complete!"
echo "   Status: pm2 status"
echo "   Logs:   pm2 logs linipos-api"
echo "   Health: curl http://localhost:3001/health"
