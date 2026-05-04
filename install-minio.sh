#!/bin/bash
# ============================================================
# AUTOBOT.AI — Cài đặt MinIO Server trên Ubuntu (không Docker)
# ============================================================
set -e

echo "=== Cài đặt MinIO Server ==="

# 1. Tải MinIO binary
wget -q https://dl.min.io/server/minio/release/linux-amd64/minio -O /usr/local/bin/minio
chmod +x /usr/local/bin/minio

# 2. Tải MinIO Client (mc)
wget -q https://dl.min.io/client/mc/release/linux-amd64/mc -O /usr/local/bin/mc
chmod +x /usr/local/bin/mc

# 3. Tạo thư mục data
mkdir -p /var/lib/minio/data

# 4. Tạo user riêng cho MinIO
if ! id minio-user &>/dev/null; then
    useradd -r minio-user -s /sbin/nologin
fi
chown -R minio-user:minio-user /var/lib/minio

# 5. Tạo file cấu hình mặc định
cat > /etc/default/minio << 'ENDCONF'
# MinIO configuration
MINIO_VOLUMES="/var/lib/minio/data"
MINIO_OPTS="--console-address :9001 --address :9000"
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
ENDCONF

# 6. Tạo systemd service
cat > /etc/systemd/system/minio.service << 'ENDSVC'
[Unit]
Description=MinIO
Documentation=https://min.io/docs
Wants=network-online.target
After=network-online.target

[Service]
Type=notify
User=minio-user
Group=minio-user
EnvironmentFile=/etc/default/minio
ExecStart=/usr/local/bin/minio server $MINIO_VOLUMES $MINIO_OPTS
Restart=always
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
ENDSVC

# 7. Khởi động MinIO
systemctl daemon-reload
systemctl enable minio
systemctl start minio

echo ""
echo "=== Cài đặt hoàn tất! ==="
echo "MinIO API:    http://YOUR_VPS_IP:9000"
echo "MinIO Console: http://YOUR_VPS_IP:9001"
echo "Access Key:    minioadmin"
echo "Secret Key:    minioadmin"
echo ""
echo "ĐỔI PASSWORD NGAY bằng lệnh:"
echo "  export MINIO_ROOT_USER=newadmin"
echo "  export MINIO_ROOT_PASSWORD=ThayDoiPassManhVaoDay"
echo "  Sửa lại file /etc/default/minio"
echo "  systemctl restart minio"
