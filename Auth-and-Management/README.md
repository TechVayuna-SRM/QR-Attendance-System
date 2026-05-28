# QR Attendance — Authentication & User Management Module

A secure, full-stack authentication system built with **Flask** (REST API) and **React 18 + Vite** (SPA frontend).

---

## Stack

| Layer    | Tech                                     |
|----------|------------------------------------------|
| Backend  | Flask 3, SQLAlchemy, Flask-JWT-Extended  |
| Database | MySQL (PyMySQL driver)                   |
| OAuth    | Google OAuth 2.0 via Authlib             |
| Email    | Flask-Mail (Gmail SMTP / App Password)   |
| Frontend | React 18, Vite, React Router v6, Axios  |

---

## Quick Start

### 1 — Prerequisites

- Python 3.10+  
- Node.js 18+ and npm  
- MySQL 8+ server running  
- Google Cloud project with OAuth credentials  
- Gmail App Password for SMTP

### 2 — Create MySQL database

```sql
CREATE DATABASE qr_attendance CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 3 — Configure environment

```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your actual values
```

**Key variables to fill in:**

| Variable | Description |
|---|---|
| `SECRET_KEY` | Random secret key (run `python3 -c "import secrets; print(secrets.token_hex(32))"`) |
| `JWT_SECRET_KEY` | Another random key |
| `DATABASE_URL` | `mysql+pymysql://user:password@localhost:3306/qr_attendance` |
| `GOOGLE_CLIENT_ID` | From Google Cloud Console → APIs & Services → Credentials |
| `GOOGLE_CLIENT_SECRET` | Same place |
| `OAUTH_REDIRECT_URI` | `http://localhost:3000/api/auth/google/callback` (dev) |
| `MAIL_USERNAME` | Your Gmail address |
| `MAIL_PASSWORD` | Gmail **App Password** (not your real password) |

### 4 — Google OAuth setup

1. Go to https://console.cloud.google.com/apis/credentials
2. Create → OAuth 2.0 Client ID → Web application
3. **Authorized redirect URIs**: add `http://localhost:3000/api/auth/google/callback`
4. Copy Client ID and Secret to `backend/.env`

### 5 — Install backend & initialize database

```bash
cd backend

# Install Python packages (Ubuntu dev machine)
python3 -m pip install --break-system-packages -r requirements.txt

# Add Flask to PATH for this session
export PATH="$HOME/.local/bin:$PATH"

# Initialize database migrations
flask db init
flask db migrate -m "initial"
flask db upgrade

# Seed roles and domains
flask seed-db

# (Optional) Grant admin role to yourself after first login
flask create-admin your@email.com
```

### 6 — Install frontend

```bash
cd frontend
npm install
```

### 7 — Run both servers

**Terminal 1 — Backend (Flask):**
```bash
cd backend
export PATH="$HOME/.local/bin:$PATH"   # add Flask to PATH
export FLASK_ENV=development
python3 run.py
# → Running on http://localhost:5000
```

**Terminal 2 — Frontend (Vite):**
```bash
cd frontend
npx vite
# → Local: http://localhost:3000
```

Open **http://localhost:3000** in your browser.

---

## How the OAuth + Cookie flow works

```
Browser (localhost:3000)
  │  User clicks "Sign in with Google"
  │  window.location.href = '/api/auth/google'
  │
  ▼  Vite dev proxy forwards to Flask at :5000
  │  Flask redirects → Google
  │
  ◄──  Google redirects → localhost:3000/api/auth/google/callback
  │    Vite proxies to Flask; Flask issues JWT cookies (scoped to :3000)
  │    Flask redirects → React /auth/callback
  │
  ▼  React /auth/callback calls GET /api/auth/me
     JWT cookie travels automatically (same origin via Vite proxy)
     AuthContext hydrated → redirect to /profile or /verify-email
```

---

## API Reference

### Auth routes (`/api/auth/...`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET  | `/google`            | —         | Initiate Google OAuth |
| GET  | `/google/callback`   | —         | OAuth callback (Flask internal) |
| GET  | `/me`                | JWT       | Current user profile |
| POST | `/verify-otp`        | JWT       | Verify 6-digit OTP |
| POST | `/resend-otp`        | JWT       | Resend OTP (3/hour) |
| POST | `/refresh`           | JWT refresh | Issue new access token |
| POST | `/logout`            | JWT       | Revoke token + clear cookies |

### Profile routes (`/api/profile/...`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET  | `/`               | JWT + verified | View own profile |
| PUT  | `/edit`           | JWT + verified | Update name |
| PUT  | `/domains`        | JWT + verified | Replace domain selections |
| GET  | `/domains/all`    | JWT           | All available domains |
| POST | `/face`           | JWT + verified | Register face (one-time, immutable) |

### Admin routes (`/api/admin/...`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET    | `/users`                    | Admin | Paginated user list |
| GET    | `/users/<id>`               | Admin | Single user |
| POST   | `/users/<id>/role`          | Admin | Add/remove role |
| POST   | `/users/<id>/toggle-active` | Admin | Activate/deactivate |
| GET    | `/stats`                    | Admin | Dashboard stats |
| GET    | `/domains`                  | Admin | All domains |
| POST   | `/domains`                  | Admin | Create domain |
| DELETE | `/domains/<id>`             | Admin | Delete domain |

---

## Security Design

| Threat | Mitigation |
|--------|-----------|
| XSS token theft | JWT stored in `HttpOnly` cookies — JS cannot access |
| CSRF | `SameSite=Lax` in dev, `SameSite=Strict` + CSRF tokens in prod |
| Brute-force OTP | Flask-Limiter: 10/hour on verify, 3/hour on resend |
| Role escalation | Server-side role checks; JWT claims never trusted alone |
| Facial data tampering | SQLAlchemy `before_update` event blocks `face_registered` reset |
| OTP interception | bcrypt-hashed in DB; 15-min TTL; single-use |
| Expired tokens | Auto-refresh interceptor in Axios; fallback to logout |
| Revoked tokens | JWT blocklist table checked on every protected request |

---

## Project Structure

```
TVproject/
├── backend/
│   ├── app/
│   │   ├── auth/       # OAuth, OTP, JWT endpoints
│   │   ├── profile/    # Profile view/edit, domains, face
│   │   ├── admin/      # User management, stats
│   │   ├── models/     # SQLAlchemy models
│   │   ├── config.py   # Dev/Prod/Test configs
│   │   ├── extensions.py
│   │   └── cli.py      # seed-db, create-admin
│   ├── .env.example
│   ├── requirements.txt
│   └── run.py
└── frontend/
    └── src/
        ├── api/        # Axios + auto-refresh interceptor
        ├── context/    # AuthContext (global auth state)
        ├── components/ # Navbar, OTPInput, DomainSelector, …
        └── pages/      # Login, Verify, Profile, Edit, Admin
```
