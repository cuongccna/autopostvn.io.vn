#!/bin/bash
# ============================================================
# AUTOBOT.AI — Deploy script (dùng git pull + PM2)
# Chạy trên VPS (trong thư mục repo): bash deploy.sh
# ============================================================

set -e
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}===========================================================${NC}"
echo -e "${GREEN}         AUTOBOT.AI — DEPLOY                                ${NC}"
echo -e "${GREEN}===========================================================${NC}"

# ──────────────────────────────────────────────────────────
# 0. Xác định thư mục repo (nơi chứa file script này)
# ──────────────────────────────────────────────────────────
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
echo -e "${YELLOW}Repo: ${REPO_DIR}${NC}"

# ──────────────────────────────────────────────────────────
# 1. Git pull
# ──────────────────────────────────────────────────────────
echo -e "${YELLOW}[1/8] Git pull...${NC}"
git -C "$REPO_DIR" pull origin main
echo -e "${GREEN}  ✓ Pull OK${NC}"

# ──────────────────────────────────────────────────────────
# 2. Cập nhật Node.js (nếu cần)
# ──────────────────────────────────────────────────────────
echo -e "${YELLOW}[2/8] Kiểm tra Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}  Cài Node.js 22.x...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
else
    echo -e "${GREEN}  Node.js $(node -v) ✓${NC}"
fi

# ──────────────────────────────────────────────────────────
# 3. Kiểm tra PM2
# ──────────────────────────────────────────────────────────
echo -e "${YELLOW}[3/8] Kiểm tra PM2...${NC}"
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}  Cài PM2...${NC}"
    npm install -g pm2
fi
echo -e "${GREEN}  PM2 $(pm2 -v) ✓${NC}"

# ──────────────────────────────────────────────────────────
# 4. Copy frontend files → web root
# ──────────────────────────────────────────────────────────
echo -e "${YELLOW}[4/8] Copy frontend files...${NC}"
WEB_ROOT="/var/www/invone"
mkdir -p "$WEB_ROOT/backend"

# Copy landing page làm index.html (trang chủ)
cp "$REPO_DIR/Landing Page.html" "$WEB_ROOT/index.html"
cp "$REPO_DIR/Landing Page.html" "$WEB_ROOT/"

# Các file HTML khác
cp "$REPO_DIR/order.html"        "$WEB_ROOT/"
cp "$REPO_DIR/dieu-khoan.html"   "$WEB_ROOT/"
cp "$REPO_DIR/bao-mat.html"      "$WEB_ROOT/"
cp "$REPO_DIR/cookie.html"       "$WEB_ROOT/"

# Assets & SEO
cp "$REPO_DIR/sitemap.xml"       "$WEB_ROOT/"
cp "$REPO_DIR/robots.txt"        "$WEB_ROOT/"
cp "$REPO_DIR/faq-chatbot.json"  "$WEB_ROOT/"
cp "$REPO_DIR/baogia.pdf"        "$WEB_ROOT/"

# Thư mục tĩnh
cp -r "$REPO_DIR/icons"          "$WEB_ROOT/"
cp -r "$REPO_DIR/images"         "$WEB_ROOT/"
cp -r "$REPO_DIR/uploads"        "$WEB_ROOT/" 2>/dev/null || true

# Blog posts
cp "$REPO_DIR"/blog-*.html       "$WEB_ROOT/" 2>/dev/null || true

chmod -R 755 "$WEB_ROOT"
echo -e "${GREEN}  ✓ Frontend OK${NC}"

# ──────────────────────────────────────────────────────────
# 5. Copy backend + cài dependencies
# ──────────────────────────────────────────────────────────
echo -e "${YELLOW}[5/8] Deploy backend...${NC}"
cp -r "$REPO_DIR/backend/package.json"        "$WEB_ROOT/backend/"
cp -r "$REPO_DIR/backend/ecosystem.config.js" "$WEB_ROOT/backend/"
cp -r "$REPO_DIR/backend/server.js"           "$WEB_ROOT/backend/"
cp -r "$REPO_DIR/backend/db"                  "$WEB_ROOT/backend/"
cp -r "$REPO_DIR/backend/routes"              "$WEB_ROOT/backend/"
cp -r "$REPO_DIR/backend/services"            "$WEB_ROOT/backend/"
cp -r "$REPO_DIR/backend/middleware"           "$WEB_ROOT/backend/"

# Copy .env từ thư mục repo (đã có sẵn trên VPS, không nằm trong git)
if [ -f "$REPO_DIR/.env" ]; then
    cp "$REPO_DIR/.env" "$WEB_ROOT/.env"
    chmod 600 "$WEB_ROOT/.env"
elif [ ! -f "$WEB_ROOT/.env" ]; then
    echo -e "${RED}  ⚠ Chưa có .env! Tạo từ .env.example${NC}"
    cp "$REPO_DIR/.env.example" "$WEB_ROOT/.env"
    echo -e "${RED}  → Sửa: nano $WEB_ROOT/.env${NC}"
fi

# Install npm
cd "$WEB_ROOT/backend"
npm install --production --silent
cd "$REPO_DIR"
echo -e "${GREEN}  ✓ Backend OK${NC}"

# ──────────────────────────────────────────────────────────
# 6. Restart backend qua PM2
# ──────────────────────────────────────────────────────────
echo -e "${YELLOW}[6/8] Khởi động backend với PM2...${NC}"
# Tạo thư mục logs nếu chưa có
mkdir -p "$WEB_ROOT/backend/logs"

# Dùng ecosystem file để start/restart
pm2 startOrRestart "$WEB_ROOT/backend/ecosystem.config.js" --env production
pm2 save
echo -e "${GREEN}  ✓ PM2 OK${NC}"

# ──────────────────────────────────────────────────────────
# 7. Copy nginx config (nếu có thay đổi)
# ──────────────────────────────────────────────────────────
echo -e "${YELLOW}[7/8] Cập nhật Nginx config...${NC}"
if [ -f "$REPO_DIR/nginx.conf" ]; then
    cp "$REPO_DIR/nginx.conf" "/etc/nginx/sites-available/autobot.ai.vn"
    nginx -t && systemctl reload nginx
    echo -e "${GREEN}  ✓ Nginx reload OK${NC}"
else
    echo -e "${YELLOW}  Bỏ qua (không có nginx.conf)${NC}"
fi

# ──────────────────────────────────────────────────────────
# 8. Done
# ──────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}===========================================================${NC}"
echo -e "${GREEN}  DEPLOY HOÀN TẤT! ✓                                       ${NC}"
echo -e "${GREEN}===========================================================${NC}"
echo ""
echo "  Frontend:   https://autobot.ai.vn"
echo "  Backend:    https://autobot.ai.vn/api/health"
echo "  Admin:      https://autobot.ai.vn/api/admin/orders?token=<ADMIN_TOKEN>"
echo ""
echo "─── QLý backend với PM2 ───"
echo "  pm2 status                   # Xem trạng thái"
echo "  pm2 logs autobot-backend     # Xem log"
echo "  pm2 restart autobot-backend  # Restart"
echo "  pm2 stop autobot-backend     # Dừng"
echo ""
echo "─── Xem log nginx ───"
echo "  tail -f /var/log/nginx/access.log"
echo "  tail -f /var/log/nginx/error.log"
echo ""
echo "─── Cài MinIO (nếu cần upload file) ───"
echo "  bash $REPO_DIR/install-minio.sh"
