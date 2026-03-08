#!/bin/bash
# =============================================================================
# DiaCare CRM + AVA AI Voice Agent + FreePBX Full Setup Script
# Debian 12 | Single-run | Autonomous
# =============================================================================

set +e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[x]${NC} $1"; exit 1; }
info() { echo -e "${BLUE}[i]${NC} $1"; }

DIACARE_DIR="/home/lokesh/diacare-crm"
DIACARE_URL="https://github.com/loki500000/diacare-crm.git"
REPO_DIR="${DIACARE_DIR}/AVA-AI-Voice-Agent-for-Asterisk"
DB_USER="asteriskuser"
DB_PASS="amp109"
AMI_USER="admin"
AMI_PASS="amp111"
PG_USER="diacare"
PG_PASS="diacare2024"
PG_DB="diacaredb"
CRM_ADMIN_USER="admin"
CRM_ADMIN_PASS="diacare2024"
FREEPBX_URL="https://mirror.freepbx.org/modules/packages/freepbx/freepbx-17.0-latest.tgz"

echo ""
echo "=============================================="
echo "  DiaCare CRM + AVA + FreePBX Setup"
echo "  Debian 12 | $(date)"
echo "=============================================="
echo ""

# =============================================================================
# PART 1 — PREFLIGHT
# =============================================================================
log "Checking prerequisites..."
[[ $(id -u) -ne 0 ]] && err "Run as root or with sudo"
command -v docker &>/dev/null || err "Docker not installed"
command -v git &>/dev/null || err "Git not installed"
log "Prerequisites OK"

# =============================================================================
# PART 2 — CLONE DIACARE REPO (includes AVA)
# =============================================================================
log "Cloning DiaCare CRM repo (includes AVA)..."
if [ -d "$DIACARE_DIR" ]; then
    warn "Repo already exists at $DIACARE_DIR — skipping clone"
else
    git clone "$DIACARE_URL" "$DIACARE_DIR"
    log "Repo cloned"
fi

# =============================================================================
# PART 3 — FIX ASTERISK HTTP SERVER
# =============================================================================
log "Configuring Asterisk HTTP server..."

find /etc/asterisk -maxdepth 1 -type l | while read link; do
    [ -e "$link" ] || rm -f "$link"
done

cat > /etc/asterisk/http.conf << 'EOF'
[general]
enabled=yes
enablestatic=yes
bindaddr=0.0.0.0
bindport=8088
sessionlimit=100
session_inactivity=30000
session_keep_alive=15000
EOF

cat > /etc/asterisk/http_additional.conf << 'EOF'
[general]
enabled=yes
enablestatic=yes
bindaddr=0.0.0.0
bindport=8088
sessionlimit=100
session_inactivity=30000
session_keep_alive=15000
EOF

/usr/sbin/asterisk -rx "core restart now" &>/dev/null || true
sleep 8

/usr/sbin/asterisk -rx "http show status" 2>/dev/null | grep -q "Enabled and Bound" \
    && log "Asterisk HTTP up on port 8088" \
    || warn "Asterisk HTTP may not be up — check manually"

# =============================================================================
# PART 4 — ADD DIALPLAN CONTEXT
# =============================================================================
log "Adding Asterisk dialplan context..."
if grep -q "from-ai-agent" /etc/asterisk/extensions_custom.conf 2>/dev/null; then
    warn "Dialplan context already exists — skipping"
else
    cat >> /etc/asterisk/extensions_custom.conf << 'EOF'

[from-ai-agent]
exten => s,1,NoOp(Asterisk AI Voice Agent)
 same => n,Stasis(asterisk-ai-voice-agent)
 same => n,Hangup()
EOF
    /usr/sbin/asterisk -rx "dialplan reload" &>/dev/null
    log "Dialplan context added"
fi

# =============================================================================
# PART 5 — INSTALL ALL DEPENDENCIES
# =============================================================================
log "Installing system dependencies..."

mkdir -p /etc/mysql
rm -f /etc/mysql/mariadb.cnf
dpkg --configure -a 2>/dev/null || true

DEBIAN_FRONTEND=noninteractive apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    apache2 mariadb-server mariadb-client \
    php8.2 php8.2-cli php8.2-curl php8.2-mysql php8.2-gd php8.2-mbstring \
    php8.2-xml php8.2-zip php8.2-bcmath php8.2-intl php8.2-ldap \
    php8.2-sqlite3 php8.2-soap \
    postgresql python3-pip python3-venv \
    nodejs npm git curl wget unzip \
    sox libsox-fmt-mp3 mpg321 lame ffmpeg \
    build-essential cron 2>/dev/null

# Fix PHP XML extension — enable for both CLI and Apache
mkdir -p /etc/php/8.2/cli/conf.d /etc/php/8.2/apache2/conf.d
cat > /etc/php/8.2/cli/conf.d/20-xml.ini << 'EOF'
extension=xml.so
extension=simplexml.so
extension=dom.so
EOF
[ -f /etc/php/8.2/mods-available/xml.ini ] && \
    cp /etc/php/8.2/mods-available/xml.ini /etc/php/8.2/apache2/conf.d/20-xml.ini
cp /etc/php/8.2/cli/conf.d/20-xml.ini /etc/php/8.2/apache2/conf.d/20-xml-extra.ini 2>/dev/null || true

php -r "exit(extension_loaded('simplexml') ? 0 : 1);" 2>/dev/null \
    && log "Dependencies installed (PHP XML OK)" \
    || warn "PHP XML may still be missing — FreePBX install might fail"

# =============================================================================
# PART 6 — CONFIGURE MARIADB (for FreePBX)
# =============================================================================
log "Configuring MariaDB..."
systemctl start mariadb
systemctl enable mariadb

mysql -e "CREATE DATABASE IF NOT EXISTS asterisk;"
mysql -e "CREATE DATABASE IF NOT EXISTS asteriskcdrdb;"
mysql -e "CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';"
mysql -e "GRANT ALL PRIVILEGES ON asterisk.* TO '${DB_USER}'@'localhost';"
mysql -e "GRANT ALL PRIVILEGES ON asteriskcdrdb.* TO '${DB_USER}'@'localhost';"
mysql -e "FLUSH PRIVILEGES;"
log "MariaDB configured"

# =============================================================================
# PART 7 — CONFIGURE POSTGRESQL (for DiaCare CRM)
# =============================================================================
log "Configuring PostgreSQL..."
systemctl start postgresql
systemctl enable postgresql

sudo -u postgres psql -c "CREATE USER ${PG_USER} WITH PASSWORD '${PG_PASS}';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE ${PG_DB} OWNER ${PG_USER};" 2>/dev/null || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${PG_DB} TO ${PG_USER};" 2>/dev/null || true

sudo -u postgres psql ${PG_DB} -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";" 2>/dev/null || true
sudo -u postgres psql ${PG_DB} < "${DIACARE_DIR}/supabase/schema.sql" &>/dev/null || true
sudo -u postgres psql ${PG_DB} -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO ${PG_USER}; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${PG_USER};" 2>/dev/null || true

log "PostgreSQL configured"

# =============================================================================
# PART 8 — CONFIGURE APACHE
# =============================================================================
log "Configuring Apache..."
systemctl start apache2
systemctl enable apache2
a2enmod rewrite expires headers &>/dev/null
sed -i 's/AllowOverride None/AllowOverride All/' /etc/apache2/apache2.conf
systemctl restart apache2
rm -f /var/www/html/index.html
log "Apache configured"

# =============================================================================
# PART 9 — CONFIGURE AVA .ENV
# =============================================================================
log "Configuring AVA .env..."
cd "$REPO_DIR"
bash preflight.sh --apply-fixes &>/dev/null
log "Preflight complete"

DOCKER_HOST_IP=$(docker network inspect bridge --format='{{range .IPAM.Config}}{{.Gateway}}{{end}}' 2>/dev/null || echo "172.17.0.1")
sed -i "s/^ASTERISK_HOST=127.0.0.1/ASTERISK_HOST=${DOCKER_HOST_IP}/" "$REPO_DIR/.env"
log "ASTERISK_HOST set to Docker bridge IP: $DOCKER_HOST_IP"

# =============================================================================
# PART 10 — START AVA DOCKER CONTAINERS
# =============================================================================
log "Building and starting AVA Docker containers..."
cd "$REPO_DIR"
docker compose -p asterisk-ai-voice-agent up -d --build admin_ui ai_engine 2>&1 | grep -E "Started|Created|Built|error" || true
log "AVA containers started"

# =============================================================================
# PART 11 — DOWNLOAD AND INSTALL FREEPBX
# =============================================================================
log "Downloading FreePBX 17..."
cd /usr/src
if [ ! -f freepbx-17.0-latest.tgz ]; then
    wget -q "$FREEPBX_URL" -O freepbx-17.0-latest.tgz
fi
tar -xzf freepbx-17.0-latest.tgz
log "FreePBX downloaded and extracted"

log "Installing FreePBX (this takes a few minutes)..."
rm -f /etc/amportal.conf 2>/dev/null || true

sh -c 'cd /usr/src/freepbx && php install \
    --dbhost=127.0.0.1 \
    --dbuser=asteriskuser \
    --dbpass=amp109 \
    --dbname=asterisk \
    --cdrdbname=asteriskcdrdb \
    --webroot=/var/www/html \
    --astetcdir=/etc/asterisk \
    --astmoddir=/usr/lib/asterisk/modules \
    --astrundir=/var/run/asterisk \
    --astvarlibdir=/var/lib/asterisk \
    --astagidir=/var/lib/asterisk/agi-bin \
    --astspooldir=/var/spool/asterisk \
    --astlogdir=/var/log/asterisk \
    --ampbin=/var/lib/asterisk/bin \
    --ampsbin=/usr/sbin \
    --ampplayback=/var/lib/asterisk/sounds/asterisk-moh' 2>&1 | grep -E "success|error|Error|Fatal" || true

log "FreePBX installed"

# =============================================================================
# PART 12 — SET PERMISSIONS
# =============================================================================
log "Setting permissions..."
chown -R asterisk:asterisk /var/www/html /var/lib/asterisk /var/spool/asterisk /var/log/asterisk /etc/asterisk

sed -i 's/APACHE_RUN_USER=www-data/APACHE_RUN_USER=asterisk/' /etc/apache2/envvars
sed -i 's/APACHE_RUN_GROUP=www-data/APACHE_RUN_GROUP=asterisk/' /etc/apache2/envvars
systemctl restart apache2
log "Permissions set"

# =============================================================================
# PART 13 — RE-FIX ASTERISK HTTP (FreePBX overwrites it during install)
# =============================================================================
log "Re-fixing Asterisk HTTP server after FreePBX install..."

find /etc/asterisk -maxdepth 1 -type l | while read link; do
    [ -e "$link" ] || rm -f "$link"
done

cat > /etc/asterisk/http.conf << 'EOF'
[general]
enabled=yes
enablestatic=yes
bindaddr=0.0.0.0
bindport=8088
sessionlimit=100
session_inactivity=30000
session_keep_alive=15000
EOF

cat > /etc/asterisk/http_additional.conf << 'EOF'
[general]
enabled=yes
enablestatic=yes
bindaddr=0.0.0.0
bindport=8088
sessionlimit=100
session_inactivity=30000
session_keep_alive=15000
EOF

/usr/sbin/asterisk -rx "core restart now" &>/dev/null || true
sleep 8
log "Asterisk restarted"

# =============================================================================
# PART 14 — CONFIGURE AMI FOR FREEPBX
# =============================================================================
log "Configuring Asterisk Manager Interface (AMI)..."

if ! grep -q "\[${AMI_USER}\]" /etc/asterisk/manager_custom.conf 2>/dev/null; then
    cat >> /etc/asterisk/manager_custom.conf << EOF

[${AMI_USER}]
secret = ${AMI_PASS}
deny=0.0.0.0/0.0.0.0
permit=127.0.0.1/255.255.255.0
read = system,call,log,verbose,command,agent,user,config,dtmf,reporting,cdr,dialplan,originate,message
write = system,call,log,verbose,command,agent,user,config,dtmf,reporting,cdr,dialplan,originate,message
writetimeout = 5000
EOF
fi

mysql -u "$DB_USER" -p"$DB_PASS" asterisk -e "UPDATE freepbx_settings SET value='${AMI_USER}' WHERE keyword='AMPMGRUSER';" 2>/dev/null
mysql -u "$DB_USER" -p"$DB_PASS" asterisk -e "UPDATE freepbx_settings SET value='${AMI_PASS}' WHERE keyword='AMPMGRPASS';" 2>/dev/null
mysql -u "$DB_USER" -p"$DB_PASS" asterisk -e "UPDATE freepbx_settings SET value='127.0.0.1' WHERE keyword='ASTMANAGERHOST';" 2>/dev/null

/usr/sbin/asterisk -rx "manager reload" &>/dev/null
log "AMI configured"

# =============================================================================
# PART 15 — START FREEPBX
# =============================================================================
log "Starting FreePBX..."
/usr/sbin/fwconsole chown &>/dev/null
/usr/sbin/fwconsole restart 2>&1 | grep -E "Started|Error" || true

# =============================================================================
# PART 16 — SETUP DIACARE CRM BACKEND
# =============================================================================
log "Setting up DiaCare CRM backend..."

cat > "${DIACARE_DIR}/crm-backend/.env" << EOF
DATABASE_URL=postgresql://${PG_USER}:${PG_PASS}@localhost:5432/${PG_DB}
SUPER_ADMIN_USERNAME=${CRM_ADMIN_USER}
SUPER_ADMIN_PASSWORD=${CRM_ADMIN_PASS}
PORT=8001
EOF

cd "${DIACARE_DIR}/crm-backend"
python3 -m venv venv
venv/bin/pip install -q -r requirements.txt

cat > /etc/systemd/system/diacare-backend.service << EOF
[Unit]
Description=DiaCare CRM Backend
After=network.target postgresql.service

[Service]
User=root
WorkingDirectory=${DIACARE_DIR}/crm-backend
ExecStart=${DIACARE_DIR}/crm-backend/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8001
Restart=always
RestartSec=5
EnvironmentFile=${DIACARE_DIR}/crm-backend/.env

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable diacare-backend
systemctl start diacare-backend
sleep 3
log "DiaCare backend started"

# =============================================================================
# PART 17 — SETUP DIACARE CRM FRONTEND
# =============================================================================
log "Building DiaCare CRM frontend..."

SERVER_IP=$(curl -s --max-time 3 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
cat > "${DIACARE_DIR}/frontend/.env.local" << EOF
NEXT_PUBLIC_API_URL=http://${SERVER_IP}:8001
EOF

cd "${DIACARE_DIR}/frontend"
npm install --silent 2>/dev/null
npm run build 2>&1 | tail -3

cat > /etc/systemd/system/diacare-frontend.service << EOF
[Unit]
Description=DiaCare CRM Frontend
After=network.target diacare-backend.service

[Service]
User=root
WorkingDirectory=${DIACARE_DIR}/frontend
ExecStart=/usr/bin/npx next start -p 3000
Restart=always
RestartSec=5
Environment=PORT=3000
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable diacare-frontend
systemctl start diacare-frontend
sleep 4
log "DiaCare frontend started"

# =============================================================================
# PART 18 — SEED DIACARE ARI SETTINGS
# =============================================================================
log "Seeding DiaCare ARI settings..."
sudo -u postgres psql ${PG_DB} << EOF
INSERT INTO settings (key, value) VALUES
  ('asterisk_ari_url',        'http://localhost:8088'),
  ('asterisk_ari_username',   'asterisk'),
  ('asterisk_ari_password',   'asterisk'),
  ('asterisk_ai_context',     'medical-receptionist'),
  ('asterisk_outbound_trunk', 'PJSIP/trunk')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
EOF
log "ARI settings seeded"

# =============================================================================
# PART 19 — RESTART AVA ai_engine
# =============================================================================
log "Restarting AVA ai_engine..."
cd "$REPO_DIR"
docker compose -p asterisk-ai-voice-agent restart ai_engine &>/dev/null
sleep 10

# =============================================================================
# PART 20 — FINAL VERIFICATION
# =============================================================================
echo ""
echo "=============================================="
echo "  VERIFICATION"
echo "=============================================="

AST_VER=$(/usr/sbin/asterisk -rx "core show version" 2>/dev/null | head -1)
[ -n "$AST_VER" ] && log "Asterisk: $AST_VER" || warn "Asterisk: not responding"

/usr/sbin/asterisk -rx "http show status" 2>/dev/null | grep -q "Enabled and Bound" \
    && log "Asterisk HTTP: port 8088 OK" \
    || warn "Asterisk HTTP: not bound"

AMI_CONN=$(/usr/sbin/asterisk -rx "manager show connected" 2>/dev/null | grep -c "127.0.0.1" || echo 0)
[ "$AMI_CONN" -gt 0 ] && log "AMI: $AMI_CONN connection(s) active" || warn "AMI: no connections"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/admin 2>/dev/null)
[ "$HTTP_CODE" = "301" ] && log "FreePBX web: OK (HTTP $HTTP_CODE)" || warn "FreePBX web: HTTP $HTTP_CODE"

AVA_STATUS=$(curl -s http://localhost:15000/health 2>/dev/null | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(d['status'],'| ARI:',d['ari_connected'])" 2>/dev/null)
[ -n "$AVA_STATUS" ] && log "AVA health: $AVA_STATUS" || warn "AVA: health endpoint not responding"

CRM_BACK=$(curl -s http://localhost:8001/health 2>/dev/null | python3 -c \
    "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
[ "$CRM_BACK" = "ok" ] && log "DiaCare backend: OK" || warn "DiaCare backend: not responding"

CRM_FRONT=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null)
[ "$CRM_FRONT" = "200" ] || [ "$CRM_FRONT" = "307" ] \
    && log "DiaCare frontend: OK (HTTP $CRM_FRONT)" \
    || warn "DiaCare frontend: HTTP $CRM_FRONT"

systemctl is-active apache2 &>/dev/null && log "Apache: running" || warn "Apache: not running"
systemctl is-active mariadb &>/dev/null && log "MariaDB: running" || warn "MariaDB: not running"
systemctl is-active postgresql &>/dev/null && log "PostgreSQL: running" || warn "PostgreSQL: not running"

echo ""
echo "=============================================="
echo "  ACCESS"
echo "=============================================="
echo -e "  FreePBX Admin  : ${GREEN}http://${SERVER_IP}/admin${NC}"
echo -e "  AVA Admin UI   : ${GREEN}http://${SERVER_IP}:3003${NC}"
echo -e "  DiaCare CRM    : ${GREEN}http://${SERVER_IP}:3000${NC}"
echo -e "  DiaCare API    : ${GREEN}http://${SERVER_IP}:8001${NC}"
echo ""
echo -e "  FreePBX login  : admin / (set on first login)"
echo -e "  AVA login      : admin / admin"
echo -e "  DiaCare login  : ${CRM_ADMIN_USER} / ${CRM_ADMIN_PASS}"
echo ""
echo "=============================================="
echo "  DONE"
echo "=============================================="
