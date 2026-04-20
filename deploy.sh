#!/bin/bash
# ============================================================
# INVONE — Deploy script
# Chạy trên VPS: bash deploy.sh
# ============================================================

set -e
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== INVONE Deploy ===${NC}"

# 1. Cập nhật packages
echo -e "${YELLOW}[1/6] Cập nhật hệ thống...${NC}"
apt-get update -qq

# 2. Cài Nginx nếu chưa có
if ! command -v nginx &> /dev/null; then
    echo -e "${YELLOW}[2/6] Cài đặt Nginx...${NC}"
    apt-get install -y nginx
else
    echo -e "${GREEN}[2/6] Nginx đã có ✓${NC}"
fi

# 3. Cài Certbot nếu chưa có
if ! command -v certbot &> /dev/null; then
    echo -e "${YELLOW}[3/6] Cài đặt Certbot (SSL)...${NC}"
    apt-get install -y certbot python3-certbot-nginx
else
    echo -e "${GREEN}[3/6] Certbot đã có ✓${NC}"
fi

# 4. Tạo thư mục web
echo -e "${YELLOW}[4/6] Tạo thư mục /var/www/invone...${NC}"
mkdir -p /var/www/invone

# 5. Copy file
echo -e "${YELLOW}[5/6] Copy files lên server...${NC}"
cp "Landing Page.html" /var/www/invone/index.html
cp "Landing Page.html" /var/www/invone/
cp dieu-khoan.html    /var/www/invone/
cp bao-mat.html       /var/www/invone/
cp cookie.html        /var/www/invone/
cp sitemap.xml        /var/www/invone/
cp robots.txt         /var/www/invone/
chmod -R 755 /var/www/invone

# 6. Nginx config
echo -e "${YELLOW}[6/6] Cấu hình Nginx...${NC}"
cp deploy/nginx.conf /etc/nginx/sites-available/invone
ln -sf /etc/nginx/sites-available/invone /etc/nginx/sites-enabled/invone
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx

echo -e "${GREEN}=== Deploy xong! ===${NC}"
echo ""
echo "Bước tiếp theo — chạy SSL:"
echo "  certbot --nginx -d autopostvn.io.vn -d www.autopostvn.io.vn"
echo ""
echo "Truy cập: http://72.61.114.103"
