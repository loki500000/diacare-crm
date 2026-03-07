# CRM Integration Guide — Asterisk AVA

Connect **any CRM** to AVA without modifying AVA's source code or Asterisk internals.
The integration is driven entirely by two environment variables and two standard HTTP endpoints.

---

## How It Works

```
Inbound Call (SIP)                     Outbound Call (CRM triggers)
      ↓                                        ↓
Asterisk dialplan                    CRM → POST /api/calls/originate
      ↓                                        ↓
Stasis(asterisk-ai-voice-agent)      Asterisk ARI /ari/channels
      ↓                                        ↓
AVA pre_call_lookup                  AVA pre_call_lookup
      ↓                                        ↓
GET {CRM_LOOKUP_URL}?phone=+91XXXXXX GET {CRM_LOOKUP_URL}?phone=+91XXXXXX
      ↓                                        ↓
CRM returns contact data             CRM returns contact data
      ↓                                        ↓
AVA: "Hello {contact_name}..."       AVA: "Hello {contact_name}..."
      ↓                                        ↓
AI conversation runs                 AI conversation runs
      ↓                                        ↓
Call ends → AVA post_call_webhook    Call ends → AVA post_call_webhook
      ↓                                        ↓
POST {CRM_WEBHOOK_URL}               POST {CRM_WEBHOOK_URL}
      ↓                                        ↓
CRM stores transcript + summary      CRM stores transcript + summary
```

---

## What Each Layer Owns

| Layer | Owner | Responsibility |
|---|---|---|
| SIP / RTP | Asterisk | Phone call setup and teardown |
| AI voice conversation | AVA (unchanged) | Runs the voice agent |
| Contact lookup | Each CRM | Implements `GET /lookup?phone=` |
| Call result storage | Each CRM | Implements `POST /webhook` |
| Agent persona | `.env` `CRM_AGENT_PROMPT` | Defines the AI's behavior |

**AVA's source code is never modified.** Only `config/ai-agent.local.yaml` and `.env` change.

---

## Setup — 3 Steps

### Step 1 — Add CRM vars to AVA's `.env`

```env
# Which CRM to connect to
CRM_LOOKUP_URL=http://localhost:8001/api/patients/lookup
CRM_WEBHOOK_URL=http://localhost:8001/api/calls/webhook

# What the AI should do on calls
CRM_AGENT_PROMPT=You are a compassionate health assistant for DiaCare. \
  The patient is {contact_name}, condition: {contact_label1}, \
  severity: {contact_label2}, medications: {contact_detail1}, \
  compliance: {contact_detail2}. Check in on their health, \
  ask about medications and blood sugar. Keep it under 5 minutes.
```

### Step 2 — Add dialplan to Asterisk

Copy `config/crm-dialplan.conf` into `/etc/asterisk/extensions_custom.conf`, then:

```bash
asterisk -rx "dialplan reload"
```

### Step 3 — Start AVA

```bash
docker compose up -d
```

AVA will load `config/ai-agent.local.yaml` on startup and the `crm-agent` context will be live.

---

## Standard CRM Interface

Any CRM that implements these two endpoints will work with AVA out of the box.

### Lookup Endpoint

**AVA calls this before speaking — after the call answers, before the greeting.**

```
GET {CRM_LOOKUP_URL}?phone={caller_number}
```

**Required response fields:**

```json
{
  "id":          "uuid or internal ID",
  "name":        "Contact display name",
  "label1":      "Primary category (e.g. condition, property type, account tier)",
  "label2":      "Secondary category (e.g. severity, budget, region)",
  "detail1":     "Detail line 1 (e.g. medications, last interaction, product)",
  "detail2":     "Detail line 2 (e.g. compliance score, offer status, value)",
  "focus_areas": "What the AI should focus on this call",
  "notes":       "Any additional context or risk flags"
}
```

**If the phone number is not found**, return a generic fallback so the call still proceeds:

```json
{
  "id":          "",
  "name":        "there",
  "label1":      "",
  "label2":      "",
  "detail1":     "",
  "detail2":     "",
  "focus_areas": "general inquiry",
  "notes":       ""
}
```

**How AVA injects these into the prompt:**

| Response field | AVA variable |
|---|---|
| `id` | `{contact_id}` |
| `name` | `{contact_name}` |
| `label1` | `{contact_label1}` |
| `label2` | `{contact_label2}` |
| `detail1` | `{contact_detail1}` |
| `detail2` | `{contact_detail2}` |
| `focus_areas` | `{contact_focus}` |
| `notes` | `{contact_notes}` |

Use these variables in `CRM_AGENT_PROMPT` to personalise the conversation.

---

### Webhook Endpoint

**AVA POSTs this after the call ends (fire-and-forget).**

```
POST {CRM_WEBHOOK_URL}
Content-Type: application/json
```

**Payload:**

```json
{
  "caller_id":     "+919876543210",
  "transcript":    [
    { "role": "assistant", "content": "Hello John, how are you feeling today?" },
    { "role": "user",      "content": "I'm doing okay, took my medications this morning." }
  ],
  "summary":       "Patient confirmed medication adherence. Blood sugar at 140. No symptoms reported.",
  "duration_secs": 187,
  "outcome":       "answered_human",
  "started_at":    "2026-03-07T09:15:00Z",
  "ended_at":      "2026-03-07T09:18:07Z",
  "tool_calls":    []
}
```

**Recommended response:**

```json
{ "ok": true, "call_log_id": "uuid" }
```

AVA ignores the response body — it's fire-and-forget — but returning this helps with debugging.

---

## Switching CRMs

No AVA changes needed. Just update three lines in `.env` and restart:

### DiaCare (Medical)
```env
CRM_LOOKUP_URL=http://localhost:8001/api/patients/lookup
CRM_WEBHOOK_URL=http://localhost:8001/api/calls/webhook
CRM_AGENT_PROMPT=You are a compassionate health assistant for DiaCare. Patient: {contact_name}, condition: {contact_label1}, severity: {contact_label2}, medications: {contact_detail1}, compliance: {contact_detail2}. Check medication adherence and blood sugar. Keep it under 5 minutes. Never provide diagnoses.
```

### Real Estate CRM
```env
CRM_LOOKUP_URL=http://localhost:9000/api/contacts/lookup
CRM_WEBHOOK_URL=http://localhost:9000/api/calls/webhook
CRM_AGENT_PROMPT=You are a helpful real estate assistant. Caller: {contact_name}, interested in: {contact_label1}, budget: {contact_label2}, last interaction: {contact_detail1}. Help with property enquiries and schedule viewings.
```

### HubSpot / Salesforce
```env
CRM_LOOKUP_URL=https://your-middleware.com/hubspot/lookup
CRM_WEBHOOK_URL=https://your-middleware.com/hubspot/webhook
CRM_AGENT_PROMPT=You are a sales assistant. Caller: {contact_name}, company: {contact_label1}, deal stage: {contact_label2}. Follow up on their open opportunity.
```

---

## Outbound Calls from CRM

To trigger a call to a contact from your CRM UI:

```
POST /api/calls/originate
Content-Type: application/json

{
  "patient_id": "uuid",
  "context": "crm-agent"   // optional, defaults to asterisk_ai_context setting
}
```

**Response:**
```json
{
  "ok":           true,
  "call_log_id":  "uuid",
  "channel_id":   "asterisk-channel-id",
  "patient_name": "John Smith",
  "phone":        "+919876543210",
  "context":      "crm-agent"
}
```

**Asterisk ARI credentials** are stored in the CRM settings table and configurable from the Settings page:

| Setting key | Default | Description |
|---|---|---|
| `asterisk_ari_url` | `http://localhost:8088` | ARI base URL |
| `asterisk_ari_username` | `asterisk` | ARI username |
| `asterisk_ari_password` | _(empty)_ | ARI password |
| `asterisk_ai_context` | `crm-agent` | AVA context to use |
| `asterisk_outbound_trunk` | _(empty)_ | SIP trunk format e.g. `PJSIP/trunk` |

---

## Files Changed

| File | Project | What it does |
|---|---|---|
| `config/ai-agent.local.yaml` | AVA | Defines `crm_contact_lookup` + `crm_post_call_webhook` tools and `crm-agent` context using env vars |
| `config/crm-dialplan.conf` | AVA | Sample Asterisk dialplan to paste into extensions_custom.conf |
| `.env.example` | AVA | Documents `CRM_LOOKUP_URL`, `CRM_WEBHOOK_URL`, `CRM_AGENT_PROMPT` |
| `routers/patients.py` | CRM backend | Adds `GET /api/patients/lookup` endpoint |
| `routers/calls.py` | CRM backend | Adds `POST /api/calls/originate` + `POST /api/calls/webhook` |
| `requirements.txt` | CRM backend | Adds `httpx` for ARI REST calls |
| `components/SimulateCallModal.tsx` | CRM frontend | Wires "Call" button to `/api/calls/originate` |
| `lib/api.ts` | CRM frontend | Adds `originateCall()` function |
| `app/settings/page.tsx` | CRM frontend | Adds Asterisk ARI settings fields |

---

## Troubleshooting

**Call goes through but AI doesn't know the patient name**
- Check `CRM_LOOKUP_URL` is reachable from the AVA container
- Test: `curl "http://localhost:8001/api/patients/lookup?phone=+919876543210"`
- Check AVA logs: `docker compose logs -f ai_engine | grep lookup`

**Transcript not appearing in CRM after call**
- Check `CRM_WEBHOOK_URL` is reachable from the AVA container
- Test: `curl -X POST http://localhost:8001/api/calls/webhook -H "Content-Type: application/json" -d '{"caller_id":"+91test"}'`
- Check AVA logs: `docker compose logs -f ai_engine | grep webhook`

**Outbound call fails with 502**
- Verify Asterisk ARI is running: `curl http://localhost:8088/ari/asterisk/info -u asterisk:password`
- Check `asterisk_outbound_trunk` is set correctly in CRM Settings
- Verify the trunk is configured in Asterisk/FreePBX

**"Patient not found" on lookup**
- Phone number format mismatch — CRM matches on last 10 digits
- Check patient phone is stored with or without country code in the DB
