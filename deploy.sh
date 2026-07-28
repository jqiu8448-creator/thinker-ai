#!/usr/bin/env bash
# ============================================================
# 思想家AI 一键部署脚本（支持 Ubuntu 22.04 / TencentOS / CentOS 8+）
# 用法：ssh 登录服务器后，执行：
#   bash deploy.sh
# 可选环境变量：
#   LLM_BASE_URL  LLM_API_KEY  LLM_MODEL  DAILY_LIMIT
#   DOMAIN        （可选，配 SSL 用）
# ============================================================
set -e

PROJECT_DIR="/opt/thinker-ai"
REPO_URL="https://github.com/jqiu8448-creator/thinker-ai.git"
NODE_VERSION="20"

: "${LLM_BASE_URL:=}"
: "${LLM_API_KEY:=}"
: "${LLM_MODEL:=deepseek-chat}"
: "${DAILY_LIMIT:=3}"
: "${DOMAIN:=}"

echo "========================================="
echo "  思想家AI 部署脚本"
echo "  服务器: $(hostname)"
echo "  IP: $(curl -s ifconfig.me || echo 'unknown')"
echo "========================================="

if [ "$(id -u)" -ne 0 ]; then
  echo "请用 root 执行：sudo bash deploy.sh"
  exit 1
fi

if [ ! -f /etc/os-release ]; then
  echo "无法识别系统"
  exit 1
fi

source /etc/os-release
echo "  系统: $PRETTY_NAME"

PKG_MGR=""
if command -v apt-get &>/dev/null; then
  PKG_MGR="apt"
elif command -v yum &>/dev/null; then
  PKG_MGR="yum"
elif command -v dnf &>/dev/null; then
  PKG_MGR="dnf"
else
  echo "不支持的包管理器"
  exit 1
fi

echo "  包管理器: $PKG_MGR"

# --- 1. 装基础工具 ---
echo ""
echo "[1/8] 安装基础工具..."
if [ "$PKG_MGR" = "apt" ]; then
  apt-get update -qq
  apt-get install -y -qq curl wget git nginx certbot python3-certbot-nginx ca-certificates gnupg lsb-release 2>&1 | tail -3
elif [ "$PKG_MGR" = "yum" ] || [ "$PKG_MGR" = "dnf" ]; then
  $PKG_MGR install -y epel-release 2>&1 | tail -2
  $PKG_MGR install -y curl wget git nginx certbot python3-certbot-nginx ca-certificates 2>&1 | tail -3
fi

# --- 2. 安装 Node.js 20 ---
echo ""
echo "[2/8] 安装 Node.js ${NODE_VERSION}..."
if command -v node &>/dev/null && [ "$(node -v | sed 's/v//' | cut -d. -f1)" = "$NODE_VERSION" ]; then
  echo "  Node.js ${NODE_VERSION} 已安装：$(node -v)"
else
  if [ "$PKG_MGR" = "apt" ]; then
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_VERSION}.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
    apt-get update -qq
    apt-get install -y -qq nodejs 2>&1 | tail -3
  else
    curl -fsSL https://rpm.nodesource.com/setup_${NODE_VERSION}.x | bash -
    yum install -y nodejs 2>&1 | tail -3
  fi
fi

echo "  Node: $(node -v)"
echo "  npm:  $(npm -v)"

# --- 3. 安装 PM2 ---
echo ""
echo "[3/8] 安装 PM2..."
if command -v pm2 &>/dev/null; then
  echo "  PM2 已安装：$(pm2 -v)"
else
  npm install -g pm2
  echo "  PM2 安装完成：$(pm2 -v)"
fi

# --- 4. 拉代码 ---
echo ""
echo "[4/8] 拉取项目代码..."
if [ -d "$PROJECT_DIR" ]; then
  echo "  已存在，git pull 更新..."
  cd "$PROJECT_DIR"
  git fetch origin master
  git reset --hard origin/master
else
  git clone -b master "$REPO_URL" "$PROJECT_DIR"
  cd "$PROJECT_DIR"
fi

# --- 5. 装依赖 + build ---
echo ""
echo "[5/8] 安装依赖 + 构建前端..."
cd "$PROJECT_DIR"
npm install 2>&1 | tail -3
npm run build:h5 2>&1 | tail -5

# --- 6. 写环境变量 ---
echo ""
echo "[6/8] 配置环境变量..."
cat > "$PROJECT_DIR/.env" << EOF
NODE_ENV=production
PORT=3000
TZ=Asia/Shanghai
DAILY_LIMIT=${DAILY_LIMIT}
LLM_BASE_URL=${LLM_BASE_URL}
LLM_API_KEY=${LLM_API_KEY}
LLM_MODEL=${LLM_MODEL}
EOF

if [ -n "${FEISHU_APP_ID:-}" ]; then
  echo "FEISHU_APP_ID=${FEISHU_APP_ID}" >> "$PROJECT_DIR/.env"
  echo "FEISHU_APP_SECRET=${FEISHU_APP_SECRET:-}" >> "$PROJECT_DIR/.env"
fi

# --- 7. PM2 配置 ---
echo ""
echo "[7/8] 配置 PM2 + Nginx..."

cat > "$PROJECT_DIR/ecosystem.config.js" << 'PM2EOF'
module.exports = {
  apps: [{
    name: 'thinker-ai',
    script: 'server/index.js',
    cwd: __dirname,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    autorestart: true,
    watch: false,
    error_file: '/opt/thinker-ai/.data/error.log',
    out_file: '/opt/thinker-ai/.data/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true
  }]
};
PM2EOF

mkdir -p "$PROJECT_DIR/.data"

pm2 delete thinker-ai 2>/dev/null || true
pm2 start "$PROJECT_DIR/ecosystem.config.js"
pm2 save
pm2 startup systemd 2>/dev/null || true
echo "  PM2 已启动"

# --- 8. 配置 Nginx ---
echo ""
echo "[8/8] 配置 Nginx..."

SERVER_IP=$(curl -s ifconfig.me || hostname -I | awk '{print $1}')
SERVER_NAME="${DOMAIN:-$SERVER_IP}"

# Ubuntu 用 sites-available，CentOS 用 conf.d
if [ -d /etc/nginx/sites-available ]; then
  NGINX_CONF="/etc/nginx/sites-available/thinker-ai"
  NGINX_LINK="/etc/nginx/sites-enabled/thinker-ai"
  NGINX_DISABLE="/etc/nginx/sites-enabled/default"
else
  NGINX_CONF="/etc/nginx/conf.d/thinker-ai.conf"
  NGINX_LINK="$NGINX_CONF"
  NGINX_DISABLE=""
fi

cat > "$NGINX_CONF" << NGINXEOF
server {
    listen 80;
    server_name ${SERVER_NAME};

    client_max_body_size 100m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;

        proxy_buffering off;
        proxy_cache off;
        add_header X-Accel-Buffering no;
    }
}
NGINXEOF

if [ "$NGINX_LINK" != "$NGINX_CONF" ]; then
  ln -sf "$NGINX_CONF" "$NGINX_LINK"
fi
if [ -n "$NGINX_DISABLE" ] && [ -f "$NGINX_DISABLE" ]; then
  rm -f "$NGINX_DISABLE"
fi

# 防火墙开 80/443
if command -v firewall-cmd &>/dev/null; then
  firewall-cmd --permanent --add-port=80/tcp 2>/dev/null || true
  firewall-cmd --permanent --add-port=443/tcp 2>/dev/null || true
  firewall-cmd --reload 2>/dev/null || true
fi

if [ -n "$DOMAIN" ]; then
  echo ""
  echo "  检测到域名 ${DOMAIN}，配置 SSL..."
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "admin@${DOMAIN}" 2>&1 || {
    echo "  ⚠️ SSL 配置失败（可能域名还没解析），HTTP 仍可使用"
    echo "  域名解析到服务器 IP 后，运行：certbot --nginx -d ${DOMAIN}"
  }
fi

nginx -t && systemctl reload nginx
echo "  Nginx 已配置并重启"

# --- 完成 ---
echo ""
echo "========================================="
echo "  ✅ 部署完成！"
echo ""
echo "  访问地址："
if [ -n "$DOMAIN" ]; then
  echo "    https://${DOMAIN}"
else
  echo "    http://${SERVER_IP}"
  echo "  （尚未配域名，飞书 webhook 需域名+HTTPS）"
fi
echo ""
echo "  PM2 命令："
echo "    pm2 status          查看状态"
echo "    pm2 logs            查看日志"
echo "    pm2 restart thinker-ai  重启"
echo "    pm2 stop thinker-ai     停止"
echo ""
echo "  环境变量："
echo "    LLM_BASE_URL = ${LLM_BASE_URL:-<未设置>}"
echo "    LLM_API_KEY  = ${LLM_API_KEY:+<已设置>}"
echo "    LLM_MODEL    = ${LLM_MODEL}"
echo "    DAILY_LIMIT  = ${DAILY_LIMIT}"
echo ""
echo "  ❗ 飞书接入还需要："
echo "    1. 域名 + SSL（购买域名后运行：certbot --nginx -d 你的域名）"
echo "    2. 在飞书开放平台填写 webhook 地址"
echo "    3. 在 .env 中填写 FEISHU_APP_ID / FEISHU_APP_SECRET"
echo "========================================="
