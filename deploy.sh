#!/bin/bash
# ============================================
# 💒 Hochzeits-Galerie – Deploy Script
# Kopiert nur Code-Dateien, NICHT die Daten!
# ============================================

SERVER="root@217.154.166.191"
REMOTE_DIR="/home/hochzeit"

echo "🚀 Deploying Hochzeits-Galerie..."
echo ""

# Nur Code-Dateien hochladen, NICHT data/ uploads/ node_modules/ logs/
rsync -avz --progress \
    --exclude 'node_modules/' \
    --exclude 'data/' \
    --exclude 'uploads/' \
    --exclude 'backup/' \
    --exclude 'logs/' \
    --exclude '.env' \
    ./ ${SERVER}:${REMOTE_DIR}/

echo ""
echo "📦 Installing dependencies on server..."
ssh ${SERVER} "cd ${REMOTE_DIR} && npm install --production"

echo ""
echo "🔄 Restarting server..."
ssh ${SERVER} "cd ${REMOTE_DIR} && pm2 restart hochzeit-galerie 2>/dev/null || node server.js &"

echo ""
echo "✅ Deploy abgeschlossen!"
echo "   Daten (DB + Bilder) wurden NICHT überschrieben."
