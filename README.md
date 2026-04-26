# SARS — Smart Automated Response System
## Elderly Health Monitoring Platform

Real-time AI-powered health monitoring system for elderly care facilities. Collects vitals from digital wristbands and smartwatches, analyzes health patterns using Claude AI, triggers automatic emergency alerts, and generates 30-minute health reports.

---

## System Architecture

```
Digital Wristband / Smartwatch
         │
         │  REST API (X-Device-Key auth)
         ▼
┌─────────────────────────────────────────────────┐
│              SARS Backend (Node.js)             │
│                                                 │
│  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │
│  │ REST API │  │Socket.IO │  │  Cron Jobs  │  │
│  │(Express) │  │(Real-time│  │ (30min rpt) │  │
│  └────┬─────┘  └────┬─────┘  └──────┬──────┘  │
│       │             │               │          │
│  ┌────▼─────────────▼───────────────▼──────┐  │
│  │           Core Services                 │  │
│  │  HealthAnalysis │ AlertService          │  │
│  │  ReportService  │ SocketService         │  │
│  └────┬────────────────────────────────────┘  │
│       │                                       │
│  ┌────▼───────────┐   ┌──────────────────┐   │
│  │  PostgreSQL DB │   │  Redis Cache     │   │
│  │  (Sequelize)   │   │  (Real-time data)│   │
│  └────────────────┘   └──────────────────┘   │
│                                               │
│  ┌────────────────────────────────────────┐  │
│  │    Claude AI (Anthropic)               │  │
│  │  Health Analysis + Report Summaries    │  │
│  └────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
         │
         │  WebSocket (Socket.IO)
         ▼
Guardian Dashboard / Admin Panel / Monitoring
```

---

## 5 User Roles

| Role | Description | Key Capabilities |
|------|-------------|-----------------|
| **Admin** | Full system control | Manage all users, view all data, system stats, audit logs |
| **Management** | Care facility staff | Register elderly, assign guardians, generate reports, view all alerts |
| **Elderly** | Patient | View own readings, alerts, profile |
| **Guardian** | Family/caregiver | Live monitoring, alerts, reports for assigned wards |
| **Device** | Wristband/Smartwatch | Ingest health readings via API key authentication |

---

## Alert Types & Severity

| Severity | Alert Type | Trigger Condition |
|----------|-----------|-------------------|
| 🔴 CRITICAL | Cardiac Arrest | Heart rate ≤ 35 BPM |
| 🔴 CRITICAL | Heart Attack | Heart rate ≥ 180 BPM |
| 🔴 CRITICAL | Low SpO2 | Blood oxygen ≤ 85% |
| 🔴 CRITICAL | Hypertensive Crisis | Systolic BP ≥ 220 mmHg |
| 🔴 CRITICAL | Hypothermia | Temperature ≤ 34°C |
| 🔴 CRITICAL | Hyperthermia | Temperature ≥ 41°C |
| 🔴 CRITICAL | Fall Detected | Accelerometer fall detection |
| 🔴 CRITICAL | Manual SOS | Elderly presses SOS button |
| 🟠 HIGH | Abnormal Heart Rate | Outside 40–150 BPM range |
| 🟠 HIGH | Low SpO2 | Blood oxygen < 90% |
| 🟠 HIGH | High Blood Pressure | Systolic > 200 mmHg |
| 🟠 HIGH | Panic/Stress | Heart rate ≥ 130 BPM |
| 🟠 HIGH | Device Offline | No data for 10+ minutes |
| 🟡 MEDIUM | Mild Anomalies | Near-threshold readings |

---

## Quick Start

### 1. Prerequisites
- Node.js v18+
- PostgreSQL 14+
- Redis 7+

### 2. Installation
```bash
git clone <repo>
cd sars
npm install
cp .env.example .env
# Edit .env with your database credentials and API keys
```

### 3. Database Setup
```bash
npm run migrate    # Create all tables
npm run seed       # Insert demo data
```

### 4. Start Server
```bash
npm run dev        # Development (nodemon)
npm start          # Production
```

---

## API Reference

### Base URL: `http://localhost:3000/api/v1`

---

### Authentication

#### POST `/auth/login`
```json
{ "email": "admin@sars.com", "password": "Admin@1234" }
```
Returns: `{ access_token, refresh_token, user }`

#### POST `/auth/refresh`
```json
{ "refresh_token": "..." }
```

#### POST `/auth/logout` *(requires Bearer token)*

#### GET `/auth/me` *(requires Bearer token)*

---

### Admin Routes *(role: admin)*

#### GET `/admin/dashboard`
System overview: user counts, active alerts, today's readings.

#### GET `/admin/users?role=&search=&page=&limit=`
List all users with filters.

#### POST `/admin/users`
```json
{
  "name": "New Manager",
  "email": "mgr@facility.com",
  "password": "Secure@123",
  "role": "management",
  "phone": "+1-555-0010"
}
```

#### PUT `/admin/users/:id`
Update user fields.

#### POST `/admin/users/:id/reset-password`
```json
{ "new_password": "NewPass@123" }
```

#### DELETE `/admin/users/:id`
Deactivate user (soft delete).

#### GET `/admin/stats`
System-wide statistics.

#### GET `/admin/audit-logs?user_id=&action=`
Audit trail of all actions.

---

### Management Routes *(roles: admin, management)*

#### POST `/management/elderly`
Register new elderly person:
```json
{
  "name": "Dorothy Smith",
  "email": "dorothy@email.com",
  "date_of_birth": "1940-06-12",
  "gender": "female",
  "blood_type": "A+",
  "height_cm": 158,
  "weight_kg": 60,
  "medical_conditions": ["Hypertension", "Diabetes"],
  "medications": [
    { "name": "Metformin", "dosage": "500mg", "frequency": "twice daily" }
  ],
  "emergency_contact_name": "Jane Smith",
  "emergency_contact_phone": "+1-555-0020",
  "room_number": "B-204",
  "device_id": "WB-2024-042",
  "device_type": "wristband",
  "guardian_ids": ["<guardian-user-uuid>"]
}
```

#### GET `/management/elderly?search=&health_status=&page=&limit=`
List all elderly.

#### GET `/management/elderly/:id`
Elderly profile with guardians.

#### PUT `/management/elderly/:id`
Update profile/device info.

#### POST `/management/assign-guardian`
```json
{
  "elderly_id": "<uuid>",
  "guardian_id": "<uuid>",
  "relationship": "daughter",
  "is_primary": true
}
```

#### GET `/management/reports?elderly_id=&type=&from=&to=`
All reports.

#### POST `/management/reports/generate`
```json
{
  "elderly_id": "<uuid>",
  "from": "2025-01-01T00:00:00Z",
  "to": "2025-01-01T00:30:00Z"
}
```

#### GET `/management/alerts?elderly_id=&status=&severity=`
All alerts with filters.

---

### Device / Elderly Data Ingestion *(Device API Key)*

#### POST `/elderly/readings/ingest`
**Headers:** `X-Device-Key: your_device_api_key`, `X-Device-Id: WB-2024-042`

```json
{
  "device_id": "WB-2024-042",
  "heart_rate": 78,
  "systolic_bp": 128,
  "diastolic_bp": 82,
  "spo2": 97.5,
  "temperature": 36.8,
  "respiratory_rate": 16,
  "steps": 450,
  "activity_level": "light",
  "fall_detected": false,
  "sos_triggered": false,
  "accelerometer_x": 0.01,
  "accelerometer_y": 0.02,
  "accelerometer_z": 9.81,
  "battery_level": 85,
  "signal_strength": -62,
  "latitude": 37.7749,
  "longitude": -122.4194,
  "timestamp": "2025-01-01T12:00:00Z"
}
```

**Response:**
```json
{
  "reading_id": "<uuid>",
  "health_status": "normal",
  "anomaly_score": 0,
  "alerts_triggered": 0,
  "ai_assessment": null
}
```

---

### Elderly Self-Service *(role: elderly — JWT)*

#### GET `/elderly/me` — Own profile
#### GET `/elderly/me/readings?from=&to=` — Historical readings
#### GET `/elderly/me/readings/latest` — Latest reading
#### GET `/elderly/me/alerts?status=` — Own alerts

---

### Guardian Routes *(roles: guardian, admin, management)*

#### GET `/guardian/dashboard`
Summary of all wards' current status, active alerts, and latest readings.

#### GET `/guardian/wards`
List all assigned elderly with relationship info.

#### GET `/guardian/elderly/:elderly_id/profile`
Full elderly profile.

#### GET `/guardian/elderly/:elderly_id/live`
Real-time cached latest reading.

#### GET `/guardian/elderly/:elderly_id/stream?limit=50`
Last N readings from real-time Redis cache.

#### GET `/guardian/elderly/:elderly_id/readings?from=&to=&page=&limit=`
Historical health readings.

#### GET `/guardian/elderly/:elderly_id/alerts?status=active&severity=critical`
Active alerts.

#### POST `/guardian/alerts/:alert_id/acknowledge`
Acknowledge an alert.

#### POST `/guardian/alerts/:alert_id/resolve`
```json
{ "notes": "Contacted doctor, false alarm" }
```

#### GET `/guardian/elderly/:elderly_id/reports?type=30_minute&from=&to=`
Health reports for a ward.

---

## Real-Time WebSocket (Socket.IO)

Connect with JWT:
```javascript
const socket = io('http://localhost:3000', {
  auth: { token: 'your_jwt_access_token' }
});

// Receive live health updates
socket.on('health:update', (data) => {
  console.log('Live reading:', data.vitals, data.health_status);
});

// Receive new alerts
socket.on('alert:new', (data) => {
  console.log('ALERT:', data.alerts[0].title, data.elderly_name);
});

// Receive report notifications
socket.on('report:ready', (data) => {
  console.log('Report ready for', data.elderly_name);
});

// Acknowledge alert via socket
socket.emit('alert:acknowledge', { alert_id: '<uuid>' });
```

### Rooms (auto-joined by role)
- **admin / management** → `monitoring`, `critical_alerts`
- **guardian** → `critical_alerts`, `elderly:<id>` (for each ward)
- **elderly** → `elderly:<own-id>`, `device:<device-id>`

---

## 30-Minute Automated Reports

Every 30 minutes the system:
1. Aggregates all health readings per elderly
2. Computes vital stats (avg/min/max for HR, BP, SpO2, temp)
3. Summarizes alerts by severity and type
4. Determines health trend (improving/stable/declining)
5. Generates AI narrative via Claude Sonnet
6. Creates clinical recommendations
7. Notifies guardians and management via WebSocket

---

## AI Health Analysis (Claude Sonnet 4.6)

For each health reading with anomaly score ≥ 60 or critical alerts, the system sends vitals to Claude AI and receives:
- Clinical interpretation of the reading
- Immediate risk level
- Recommended action (including whether to contact emergency services)

---

## Seed Credentials

After running `npm run seed`:

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@sars.com | Admin@1234 |
| Management | management@sars.com | Mgmt@1234 |
| Guardian | guardian@sars.com | Guardian@1234 |
| Elderly | elderly@sars.com | Elderly@1234 |
| Device ID | WB-DEMO-001 | (use with DEVICE_API_KEY) |

---

## Environment Variables

See `.env.example` for all configuration options. Key variables:

| Variable | Description |
|----------|-------------|
| `DB_*` | PostgreSQL connection |
| `REDIS_*` | Redis connection |
| `JWT_SECRET` | Access token signing key |
| `DEVICE_API_KEY` | Shared key for wristband authentication |
| `ANTHROPIC_API_KEY` | Claude AI integration |
| `REPORT_CRON_SCHEDULE` | Cron expression (default: `*/30 * * * *`) |
| `HEART_RATE_MIN/MAX` | Alert thresholds (overridable per elderly) |
