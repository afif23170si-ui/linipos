#!/bin/bash

# ============================================================
# Lini POS Deploy Script
# Usage: ./deploy.sh
# ============================================================

SERVER_USER="kvm1"
SERVER_IP="103.145.240.110"
SERVER_PORT="5903"
REMOTE_TMP="~/kasir-upload"
REMOTE_WEB="/home/afiframadhan.my.id/public_html/kasir"
WEB_OWNER="afifr1498:afifr1498"
LOCAL_DIST="./dist"

# Warna output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo ""
echo "🚀 Lini POS Deploy Script"
echo "========================"
echo ""

# Step 1: Build
echo -e "${YELLOW}[1/4] Building production bundle...${NC}"
npm run build
if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Build gagal! Deploy dibatalkan.${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Build selesai${NC}"
echo ""

# Step 2: Upload ke server
echo -e "${YELLOW}[2/4] Uploading ke server...${NC}"
ssh -p $SERVER_PORT $SERVER_USER@$SERVER_IP "mkdir -p $REMOTE_TMP"
scp -P $SERVER_PORT -r $LOCAL_DIST/* $SERVER_USER@$SERVER_IP:$REMOTE_TMP/
if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Upload gagal! Periksa koneksi SSH.${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Upload selesai${NC}"
echo ""

# Step 3: Deploy di server (cp + .htaccess + chown + cleanup)
echo -e "${YELLOW}[3/4] Deploying di server...${NC}"
ssh -p $SERVER_PORT $SERVER_USER@$SERVER_IP << 'ENDSSH'
# Copy ke web root
sudo cp -r ~/kasir-upload/* /home/afiframadhan.my.id/public_html/kasir/

# Buat ulang .htaccess (selalu diperlukan)
sudo bash -c 'cat > /home/afiframadhan.my.id/public_html/kasir/.htaccess << EOF
Options -MultiViews
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ index.html [L]
EOF'

# Fix permission
sudo chown -R afifr1498:afifr1498 /home/afiframadhan.my.id/public_html/kasir/

# Bersihkan temp
rm -rf ~/kasir-upload

echo "Server deploy done"
ENDSSH

if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Deploy di server gagal!${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Deploy di server selesai${NC}"
echo ""

# Step 4: Done
echo -e "${YELLOW}[4/4] Selesai!${NC}"
echo ""
echo -e "${GREEN}🎉 Lini POS berhasil di-deploy!${NC}"
echo -e "   🌐 https://kasir.afiframadhan.my.id"
echo ""
