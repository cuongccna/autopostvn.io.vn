#!/bin/bash
# ============================================================
# AUTOBOT.AI — Deploy script
# Chạy trên VPS: bash deploy.sh
# ============================================================

set -e
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}===========================================================${NC}"
echo -e "${GREEN}         AUTOBOT.AI — FULL DEPLOY                           ${NC}"
echo -e "${GREEN}===========================================================${NC}"

# ──────────────────────────────────────────────────────────
# 1. Cập nhật hệ thống
# ──────────────────────────────────────────────────────────
echo -e "${YELLOW}[1/9] Cập nhật hệ thống...${NC}"
apt-get update -qq

# ──────────────────────────────────────────────────────────
# 2. Cài Node.js 22.x nếu chưa có
# ──────────────────────────────────────────────────────────
echo -e "${YELLOW}[2/9] Kiểm tra Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}  Đang cài Node.js 22.x...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
else
    echo -e "${GREEN}  Node.js $(node -v) đã có ✓${NC}"
fi

# ──────────────────────────────────────────────────────────
# 3. Cài Nginx
# ──────────────────────────────────────────────────────────
echo -e "${YELLOW}[3/9] Kiểm tra Nginx...${NC}"
if ! command -v nginx &> /dev/null; then
    apt-get install -y nginx
    echo -e "${GREEN}  Nginx đã cài ✓${NC}"
else
    echo -e "${GREEN}  Nginx đã có ✓${NC}"
fi

# ──────────────────────────────────────────────────────────
# 4. Cài Certbot
# ──────────────────────────────────────────────────────────
echo -e "${YELLOW}[4/9] Kiểm tra Certbot...${NC}"
if ! command -v certbot &> /dev/null; then
    apt-get install -y certbot python3-certbot-nginx
    echo -e "${GREEN}  Certbot đã cài ✓${NC}"
else
    echo -e "${GREEN}  Certbot đã có ✓${NC}"
fi

# ──────────────────────────────────────────────────────────
# 5. Tạo thư mục web + backend
# ──────────────────────────────────────────────────────────
echo -e "${YELLOW}[5/9] Tạo thư mục...${NC}"
mkdir -p /var/www/invone/backend
chmod -R 755 /var/www/invone

# ──────────────────────────────────────────────────────────
# 6. Copy Frontend files
# ──────────────────────────────────────────────────────────
echo -e "${YELLOW}[6/9] Copy frontend files...${NC}"
cp "Landing Page.html" /var/www/invone/
cp dieu-khoan.html    /var/www/invone/
cp bao-mat.html       /var/www/invone/
cp cookie.html        /var/www/invone/
cp order.html         /var/www/invone/
cp sitemap.xml        /var/www/invone/
cp robots.txt         /var/www/invone/
cp faq-chatbot.json   /var/www/invone/
cp baogia.pdf         /var/www/invone/
cp -r icons           /var/www/invone/
cp -r images          /var/www/invone/
cp -r uploads         /var/www/invone/ 2>/dev/null || true

# Blog posts
cp blog-*.html        /var/www/invone/ 2>/dev/null || true

# ──────────────────────────────────────────────────────────
# 7. Copy Backend files + cài dependencies
# ──────────────────────────────────────────────────────────
echo -e "${YELLOW}[7/9] Deploy backend...${NC}"

# Copy backend source
cp backend/package.json /var/www/invone/backend/
cp backend/server.js    /var/www/invone/backend/
cp -r backend/db        /var/www/invone/backend/
cp -r backend/routes    /var/www/invone/backend/
cp -r backend/services  /var/www/invone/backend/
cp -r backend/middleware /var/www/invone/backend/

# Copy .env (nếu đã có, giữ lại)
if [ -f .env ]; then
    cp .env /var/www/invone/.env
    chmod 600 /var/www/invone/.env
elif [ ! -f /var/www/invone/.env ]; then
    echo -e "${RED}  ⚠ Chưa có file .env! Copy từ .env.example và điền giá trị thật.${NC}"
    echo -e "${RED}     cp .env.example .env && nano .env${NC}"
fi

# Install npm dependencies
cd /var/www/invone/backend
npm install --production --silent
cd -

# ──────────────────────────────────────────────────────────
# 8. Cài systemd service cho backend
# ──────────────────────────────────────────────────────────
echo -e "${YELLOW}[8/9] Cấu hình systemd service...${NC}"
cat > /etc/systemd/system/autobot-backend.service << 'ENDSVC'
[Unit]
Description=AUTOBOT.AI Backend API
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/invone/backend
Environment=NODE_ENV=production
EnvironmentFile=/var/www/invone/.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
ENDSVC

systemctl daemon-reload
systemctl enable autobot-backend
systemctl restart autobot-backend

# ──────────────────────────────────────────────────────────
# 9. Nginx config
# ──────────────────────────────────────────────────────────
echo -e "${YELLOW}[9/9] Cấu hình Nginx...${NC}"
cp nginx.conf /etc/nginx/sites-available/autopostvn.io.vn
ln -sf /etc/nginx/sites-available/autopostvn.io.vn /etc/nginx/sites-enabled/autopostvn.io.vn
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx

# ──────────────────────────────────────────────────────────
# Done
# ──────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}===========================================================${NC}"
echo -e "${GREEN}  DEPLOY HOÀN TẤT! ✓                                       ${NC}"
echo -e "${GREEN}===========================================================${NC}"
echo ""
echo "Kiểm tra:"
echo "  Frontend:   https://autopostvn.io.vn"
echo "  Backend:    https://autopostvn.io.vn/api/health"
echo "  Admin:      https://autopostvn.io.vn/api/admin/orders?token=YOUR_ADMIN_TOKEN"
echo ""
echo "Logs backend:"
echo "  journalctl -u autobot-backend -f"
echo ""
echo "Trạng thái:"
echo "  systemctl status autobot-backend"
echo "  systemctl status nginx"
echo ""
echo "─── CÀI MINIO (nếu cần upload file) ───"
echo "  bash install-minio.sh"
echo ""
echo "─── SSL (nếu chưa có) ───"
echo "  certbot --nginx -d autopostvn.io.vn -d www.autopostvn.io.vn"
