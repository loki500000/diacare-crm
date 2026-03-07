#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# DiaCare CRM + AVA AI Voice Agent — Debian/Ubuntu Install Script
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$REPO_DIR/crm-backend"
FRONTEND_DIR="$REPO_DIR/frontend"
AVA_DIR="$REPO_DIR/AVA-AI-Voice-Agent-for-Asterisk"
SCHEMA_FILE="$REPO_DIR/supabase/schema.sql"

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

banner() {
  echo -e "${CYAN}${BOLD}"
  echo "  ██████╗ ██╗ █████╗  ██████╗ █████╗ ██████╗ ███████╗"
  echo "  ██╔══██╗██║██╔══██╗██╔════╝██╔══██╗██╔══██╗██╔════╝"
  echo "  ██║  ██║██║███████║██║     ███████║██████╔╝█████╗  "
  echo "  ██║  ██║██║██╔══██║██║     ██╔══██║██╔══██╗██╔══╝  "
  echo "  ██████╔╝██║██║  ██║╚██████╗██║  ██║██║  ██║███████╗"
  echo "  ╚═════╝ ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝"
  echo ""
  echo "  DiaCare CRM + AVA AI Voice Agent — Debian Install"
  echo -e "${NC}"
}

info()    { echo -e "${GREEN}[✔]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
error()   { echo -e "${RED}[✘]${NC} $*" >&2; }
section() { echo -e "\n${CYAN}${BOLD}── $* ${NC}"; }

prompt_val() {
  # prompt_val "Label" "default_value" → echoes user input (or default)
  local label="$1" default="$2" val
  read -rp "  ${label} [${default}]: " val
  echo "${val:-$default}"
}

prompt_secret() {
  local label="$1" default="$2" val
  read -rsp "  ${label} [${default}]: " val
  echo ""
  echo "${val:-$default}"
}

# ── OS check ──────────────────────────────────────────────────────────────────
check_os() {
  if [[ ! -f /etc/os-release ]]; then
    error "Cannot detect OS. This script requires Debian 11+ or Ubuntu 20.04+."
    exit 1
  fi
  # shellcheck disable=SC1091
  . /etc/os-release
  case "$ID" in
    debian|ubuntu|linuxmint) ;;
    *)
      error "Unsupported OS: $ID. This script supports Debian/Ubuntu only."
      exit 1
      ;;
  esac
  info "OS: $PRETTY_NAME"
}

# ── Collect config ─────────────────────────────────────────────────────────────
collect_config() {
  section "PostgreSQL"
  DB_HOST=$(prompt_val   "DB host"     "localhost")
  DB_PORT=$(prompt_val   "DB port"     "5432")
  DB_NAME=$(prompt_val   "DB name"     "diacare")
  DB_USER=$(prompt_val   "DB user"     "diacare")
  DB_PASS=$(prompt_secret "DB password" "diacare2024")
  DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

  section "Asterisk ARI"
  ARI_HOST=$(prompt_val   "ARI host"        "127.0.0.1")
  ARI_PORT=$(prompt_val   "ARI port"        "8088")
  ARI_USER=$(prompt_val   "ARI username"    "asterisk")
  ARI_PASS=$(prompt_secret "ARI password"   "asterisk")
  OUTBOUND_TRUNK=$(prompt_val "Outbound trunk" "PJSIP/trunk")

  section "OpenAI (AVA voice AI)"
  OPENAI_KEY=$(prompt_secret "OpenAI API key" "sk-...")

  section "DiaCare Admin"
  ADMIN_USER=$(prompt_val   "Admin username" "admin")
  ADMIN_PASS=$(prompt_secret "Admin password" "diacare2024")

  section "CRM Agent Prompt (leave blank for default)"
  echo "  Default: compassionate AI health assistant for DiaCare"
  read -rp "  CRM_AGENT_PROMPT: " CRM_AGENT_PROMPT
  if [[ -z "$CRM_AGENT_PROMPT" ]]; then
    CRM_AGENT_PROMPT="You are a compassionate AI health assistant for DiaCare. The patient is {contact_name}, condition: {contact_label1}, severity: {contact_label2}, medications: {contact_detail1}, compliance: {contact_detail2}. Check in on their health, ask about medications and blood sugar. Keep it under 5 minutes. Never provide medical diagnoses."
  fi
}

# ── System dependencies ────────────────────────────────────────────────────────
install_system_deps() {
  section "Installing system dependencies"
  apt-get update -qq
  apt-get install -y --no-install-recommends \
    git curl wget ca-certificates gnupg lsb-release \
    build-essential libpq-dev \
    python3 python3-pip python3-venv python3-dev \
    postgresql postgresql-client

  # Node.js 20
  if ! command -v node &>/dev/null || [[ "$(node -v)" != v20* ]]; then
    info "Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  else
    info "Node.js $(node -v) already installed"
  fi

  # Docker
  if ! command -v docker &>/dev/null; then
    info "Installing Docker..."
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/"$ID"/gpg \
      | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/$ID $(lsb_release -cs) stable" \
      > /etc/apt/sources.list.d/docker.list
    apt-get update -qq
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl enable --now docker
  else
    info "Docker $(docker --version | head -1) already installed"
  fi
}

# ── PostgreSQL setup ───────────────────────────────────────────────────────────
setup_postgres() {
  section "Setting up PostgreSQL"
  systemctl enable --now postgresql

  # Create user + database
  sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" \
    | grep -q 1 \
    || sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';"

  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" \
    | grep -q 1 \
    || sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

  sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"

  # Run schema
  if [[ -f "$SCHEMA_FILE" ]]; then
    info "Running schema: $SCHEMA_FILE"
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SCHEMA_FILE"
    info "Schema applied successfully"
  else
    warn "Schema file not found at $SCHEMA_FILE — skipping"
  fi
}

# ── Write config files ─────────────────────────────────────────────────────────
write_configs() {
  section "Writing configuration files"

  # crm-backend/.env
  cat > "$BACKEND_DIR/.env" <<EOF
DATABASE_URL=${DATABASE_URL}
PORT=8001
SUPER_ADMIN_USERNAME=${ADMIN_USER}
SUPER_ADMIN_PASSWORD=${ADMIN_PASS}
EOF
  info "Written: $BACKEND_DIR/.env"

  # frontend/.env.local
  cat > "$FRONTEND_DIR/.env.local" <<EOF
NEXT_PUBLIC_API_URL=http://localhost:8001
EOF
  info "Written: $FRONTEND_DIR/.env.local"

  # AVA .env
  JWT_SECRET=$(openssl rand -hex 32)
  cat > "$AVA_DIR/.env" <<EOF
COMPOSE_PROJECT_NAME=asterisk-ai-voice-agent
ASTERISK_HOST=${ARI_HOST}
ASTERISK_ARI_PORT=${ARI_PORT}
ASTERISK_ARI_USERNAME=${ARI_USER}
ASTERISK_ARI_PASSWORD=${ARI_PASS}
OPENAI_API_KEY=${OPENAI_KEY}
CRM_LOOKUP_URL=http://localhost:8001/api/patients/lookup
CRM_WEBHOOK_URL=http://localhost:8001/api/calls/webhook
CRM_AGENT_PROMPT=${CRM_AGENT_PROMPT}
JWT_SECRET=${JWT_SECRET}
TZ=UTC
LOG_LEVEL=info
LOG_FORMAT=console
LOG_COLOR=1
CALL_HISTORY_ENABLED=true
CALL_HISTORY_RETENTION_DAYS=0
CALL_HISTORY_DB_PATH=data/call_history.db
EOF
  info "Written: $AVA_DIR/.env"

  # AVA config/ai-agent.local.yaml (OpenAI Realtime + DiaCare CRM context)
  cat > "$AVA_DIR/config/ai-agent.local.yaml" <<EOF
config_version: 6
active_pipeline: local_hybrid
default_provider: openai_realtime

audio_transport: audiosocket
audiosocket:
  format: slin
  host: 0.0.0.0
  port: 8090

downstream_mode: stream

contexts:
  default:
    greeting: "Hello, this is DiaCare health assistant. How can I help you today?"
    profile: openai_realtime_24k
    prompt: "You are a concise voice assistant for DiaCare clinic. Respond clearly and keep answers brief."
    provider: openai_realtime
  medical-receptionist:
    greeting: "\${CRM_GREETING:-Hello, I am the DiaCare health assistant calling on behalf of your clinic.}"
    profile: openai_realtime_24k
    prompt: "\${CRM_AGENT_PROMPT}"
    provider: openai_realtime

barge_in:
  enabled: true
  energy_threshold: 700
  initial_protection_ms: 100
  min_ms: 150
  post_tts_end_protection_ms: 100

vad:
  enhanced_enabled: true
  fallback_buffer_size: 128000
  fallback_enabled: true
  fallback_interval_ms: 4000
  max_utterance_duration_ms: 10000
  min_utterance_duration_ms: 600
  use_provider_vad: false
  utterance_padding_ms: 200
  webrtc_aggressiveness: 1
  webrtc_end_silence_frames: 50
  webrtc_start_frames: 3

streaming:
  chunk_size_ms: 20
  connection_timeout_ms: 120000
  continuous_stream: true
  empty_backoff_ticks_max: 5
  fallback_timeout_ms: 8000
  greeting_min_start_ms: 40
  jitter_buffer_ms: 950
  keepalive_interval_ms: 5000
  low_watermark_ms: 80
  min_start_ms: 120
  normalizer:
    enabled: true
    max_gain_db: 18.0
    target_rms: 1400
  provider_grace_ms: 500
  sample_rate: 8000

profiles:
  default: telephony_responsive
  openai_realtime_24k:
    chunk_ms: 20
    idle_cutoff_ms: 0
    internal_rate_hz: 24000
    provider_pref:
      input_encoding: pcm16
      input_sample_rate_hz: 24000
      output_encoding: pcm16
      output_sample_rate_hz: 24000
    transport_out:
      encoding: slin
      sample_rate_hz: 8000
  telephony_responsive:
    chunk_ms: auto
    idle_cutoff_ms: 600
    internal_rate_hz: 8000
    provider_pref:
      input_encoding: mulaw
      input_sample_rate_hz: 8000
      output_encoding: mulaw
      output_sample_rate_hz: 8000
    transport_out:
      encoding: slin
      sample_rate_hz: 8000

providers:
  openai_realtime:
    base_url: wss://api.openai.com/v1/realtime
    egress_pacer_enabled: true
    egress_pacer_warmup_ms: 320
    enabled: true
    input_encoding: ulaw
    input_sample_rate_hz: 8000
    api_version: beta
    model: gpt-4o-realtime-preview-2024-12-17
    organization: ''
    output_encoding: linear16
    output_sample_rate_hz: 24000
    provider_input_encoding: linear16
    provider_input_sample_rate_hz: 24000
    response_modalities:
    - audio
    - text
    target_encoding: mulaw
    target_sample_rate_hz: 8000
    turn_detection:
      create_response: true
      prefix_padding_ms: 200
      silence_duration_ms: 200
      threshold: 0.5
      type: server_vad
    voice: alloy

llm:
  initial_greeting: Hello, how can I help you today?
  prompt: Voice assistant. Answer in 5-8 words. Be direct. Expand only if asked.

pipelines:
  local_hybrid:
    llm: openai_llm
    options:
      llm:
        base_url: https://api.openai.com/v1
        max_tokens: 150
        model: gpt-4o-mini
        temperature: 0.7
      stt:
        chunk_ms: 160
        mode: stt
        stream_format: pcm16_16k
        streaming: true
      tts:
        format:
          encoding: mulaw
          sample_rate: 8000
    stt: local_stt
    tts: local_tts

asterisk:
  app_name: asterisk-ai-voice-agent

external_media:
  codec: ulaw
  direction: both
  port_range: 18080:18099
  rtp_host: 0.0.0.0
  rtp_port: 18080
EOF
  info "Written: $AVA_DIR/config/ai-agent.local.yaml"
}

# ── Asterisk dialplan ──────────────────────────────────────────────────────────
copy_dialplan() {
  section "Asterisk dialplan"
  DIALPLAN_SRC="$REPO_DIR/config/diacare-dialplan.conf"
  if [[ -d /etc/asterisk ]] && [[ -f "$DIALPLAN_SRC" ]]; then
    cp "$DIALPLAN_SRC" /etc/asterisk/diacare-dialplan.conf
    # Include if not already present
    if ! grep -q "diacare-dialplan.conf" /etc/asterisk/extensions.conf 2>/dev/null; then
      echo '#include "diacare-dialplan.conf"' >> /etc/asterisk/extensions.conf
    fi
    info "Dialplan copied to /etc/asterisk/diacare-dialplan.conf"
    warn "Reload Asterisk dialplan: asterisk -rx 'dialplan reload'"
  elif [[ ! -d /etc/asterisk ]]; then
    warn "/etc/asterisk not found — skipping dialplan copy (Asterisk not installed locally)"
  else
    warn "Dialplan source $DIALPLAN_SRC not found — skipping"
  fi
}

# ── CRM Backend ────────────────────────────────────────────────────────────────
install_backend() {
  section "Installing CRM backend"

  cd "$BACKEND_DIR"

  # Python venv
  python3 -m venv venv
  venv/bin/pip install --quiet --upgrade pip
  venv/bin/pip install --quiet -r requirements.txt
  info "Python dependencies installed"

  # Systemd service
  cat > /etc/systemd/system/diacare-backend.service <<EOF
[Unit]
Description=DiaCare CRM Backend (FastAPI)
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=${BACKEND_DIR}
ExecStart=${BACKEND_DIR}/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8001 --workers 2
Restart=on-failure
RestartSec=5
EnvironmentFile=${BACKEND_DIR}/.env

[Install]
WantedBy=multi-user.target
EOF
  # www-data needs to own the backend dir
  chown -R www-data:www-data "$BACKEND_DIR"

  systemctl daemon-reload
  systemctl enable diacare-backend
  systemctl restart diacare-backend
  info "diacare-backend service started"
}

# ── CRM Frontend ───────────────────────────────────────────────────────────────
install_frontend() {
  section "Installing CRM frontend (Next.js)"

  cd "$FRONTEND_DIR"
  npm ci --silent
  npm run build

  # Standalone output expected (output: 'standalone' in next.config)
  if [[ ! -f .next/standalone/server.js ]]; then
    warn "Standalone build not found — checking for standard build"
    FRONTEND_CMD="node_modules/.bin/next start -p 3000"
    FRONTEND_EXEC="$(which node) $FRONTEND_DIR/node_modules/.bin/next start"
    FRONTEND_DIR_EXEC="$FRONTEND_DIR"
  else
    cp -r .next/static .next/standalone/.next/static 2>/dev/null || true
    cp -r public .next/standalone/public 2>/dev/null || true
    FRONTEND_CMD="node .next/standalone/server.js"
    FRONTEND_EXEC="$(which node) $FRONTEND_DIR/.next/standalone/server.js"
    FRONTEND_DIR_EXEC="$FRONTEND_DIR/.next/standalone"
  fi

  cat > /etc/systemd/system/diacare-frontend.service <<EOF
[Unit]
Description=DiaCare CRM Frontend (Next.js)
After=network.target diacare-backend.service

[Service]
Type=simple
User=www-data
WorkingDirectory=${FRONTEND_DIR_EXEC}
Environment=PORT=3000
Environment=NODE_ENV=production
ExecStart=${FRONTEND_EXEC}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
  chown -R www-data:www-data "$FRONTEND_DIR"

  systemctl daemon-reload
  systemctl enable diacare-frontend
  systemctl restart diacare-frontend
  info "diacare-frontend service started"
}

# ── AVA ────────────────────────────────────────────────────────────────────────
start_ava() {
  section "Starting AVA AI Voice Agent"
  cd "$AVA_DIR"
  docker compose up -d
  info "AVA containers started"
}

# ── Summary ────────────────────────────────────────────────────────────────────
print_summary() {
  local HOST_IP
  HOST_IP=$(hostname -I | awk '{print $1}')
  echo ""
  echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}${BOLD}  Installation complete!${NC}"
  echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════${NC}"
  echo ""
  echo "  DiaCare CRM:        http://${HOST_IP}:3000"
  echo "  CRM API:            http://${HOST_IP}:8001"
  echo "  CRM API health:     http://${HOST_IP}:8001/health"
  echo "  AVA Admin UI:       http://${HOST_IP}:3003"
  echo ""
  echo "  Admin login:        ${ADMIN_USER} / (your password)"
  echo ""
  echo "  Service status:"
  echo "    systemctl status diacare-backend"
  echo "    systemctl status diacare-frontend"
  echo "    docker compose -C ${AVA_DIR} ps"
  echo ""
  echo -e "${YELLOW}  Next steps:${NC}"
  echo "    1. Configure Asterisk ARI (Settings → Asterisk in the CRM)"
  echo "    2. Log into AVA Admin UI and verify AI Engine is Connected"
  echo "    3. Add patients and create call schedules in DiaCare CRM"
  echo ""
}

# ── Main ───────────────────────────────────────────────────────────────────────
main() {
  if [[ $EUID -ne 0 ]]; then
    error "This script must be run as root (sudo bash install-diacare.sh)"
    exit 1
  fi

  banner
  check_os
  collect_config
  install_system_deps
  setup_postgres
  write_configs
  copy_dialplan
  install_backend
  install_frontend
  start_ava
  print_summary
}

main "$@"
