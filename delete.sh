#!/bin/bash
# =============================================================================
# Full Cleanup Script — removes DiaCare CRM + AVA + FreePBX
# Keeps: setup.sh, delete.sh, setup-guide.md
# =============================================================================

export DEBIAN_FRONTEND=noninteractive
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }

echo ""
echo "=============================================="
echo "  Full Cleanup"
echo "  $(date)"
echo "=============================================="
echo ""

# Stop & remove Docker containers and images
log "Stopping Docker containers..."
docker compose -p asterisk-ai-voice-agent down --volumes --remove-orphans 2>/dev/null || true
docker rmi asterisk-ai-voice-agent-admin-ui asterisk-ai-voice-agent-ai-engine 2>/dev/null || true

# Stop systemd services
log "Stopping services..."
systemctl stop diacare-frontend diacare-backend 2>/dev/null || true
systemctl disable diacare-frontend diacare-backend 2>/dev/null || true
systemctl stop apache2 mariadb postgresql cron 2>/dev/null || true
systemctl disable apache2 mariadb postgresql cron 2>/dev/null || true

# Remove systemd service files
rm -f /etc/systemd/system/diacare-backend.service
rm -f /etc/systemd/system/diacare-frontend.service
systemctl daemon-reload 2>/dev/null || true

# Kill any stuck apt processes
kill $(pgrep apt-get) 2>/dev/null || true
sleep 2
rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/cache/apt/archives/lock

# Remove packages
log "Removing packages (this takes a minute)..."
dpkg --configure -a 2>/dev/null || true
DEBIAN_FRONTEND=noninteractive apt-get remove --purge -y \
    apache2 "apache2-*" "mariadb-*" "php8.2*" \
    libapache2-mod-php8.2 postgresql "postgresql-*" python3-pip python3-venv \
    sox mpg321 lame ffmpeg 2>/dev/null || true
DEBIAN_FRONTEND=noninteractive apt-get autoremove -y 2>/dev/null || true

# Remove leftover files
log "Removing leftover files..."
rm -rf /var/www/html/* /var/lib/mysql /etc/mysql /etc/apache2 /etc/php
rm -rf /var/lib/postgresql /etc/postgresql
rm -rf /usr/src/freepbx /usr/src/freepbx-17.0-latest.tgz
rm -f /etc/freepbx.conf /usr/sbin/fwconsole /etc/amportal.conf
rm -rf /var/lib/asterisk/bin
rm -f /etc/asterisk/http.conf /etc/asterisk/http_additional.conf
rm -f /etc/asterisk/manager_custom.conf /etc/asterisk/http_custom.conf

# Remove broken symlinks in /etc/asterisk
find /etc/asterisk -maxdepth 1 -type l | while read link; do
    [ -e "$link" ] || rm -f "$link"
done

# Remove DiaCare CRM repo (includes AVA)
log "Removing DiaCare CRM and AVA..."
rm -rf /home/lokesh/diacare-crm

echo ""
echo "=============================================="
echo "  Remaining in /home/lokesh:"
ls /home/lokesh/
echo "=============================================="
log "Done. Run: sudo bash /home/lokesh/setup.sh"
echo ""
