# Lensio — optical retail app

*Your lens, our world.*

Online optical store: frames with prescription lenses, camera try-on, UPI payments, live order tracking, voice search and an AI shopping assistant. There's an Android app, a web app (iPhone, computers, any browser) and a web admin panel for staff.

| Folder | What |
|---|---|
| `backend/` | API server (Node.js 20, Express, TypeScript, PostgreSQL/Prisma). It also serves the admin panel (`/admin`), the web app (`/`) and the Android download page (`/download`) |
| `mobile/` | Customer app (React Native / Expo SDK 51). One codebase builds Android, iOS and web |
| `docs/` | **Full documentation. Start with [docs/00-START-HERE.md](docs/00-START-HERE.md)** |

## Quick start (local)

```bash
# Backend
cd backend && cp .env.example .env
docker compose -f ../docker-compose.yml up -d db     # or set DATABASE_URL to a Neon database
npm install && npx prisma db push && npm run seed && npm run dev
# → http://localhost:4000/admin   (set ADMIN_EMAILS in .env; sign-in codes print in the terminal)

# App (web preview)
cd ../mobile && npm ci
EXPO_PUBLIC_API_URL=http://localhost:4000/v1 npx expo start --web
```

## Documentation

1. [Start here](docs/00-START-HERE.md): overview, features, current setup
2. [Setup guide, A to Z](docs/01-SETUP-GUIDE.md): accounts, local development, deployment, app builds, domain
3. [Architecture](docs/02-ARCHITECTURE.md): code layout, data model, key flows, security
4. [API reference](docs/03-API-REFERENCE.md)
5. [Admin guide](docs/04-ADMIN-GUIDE.md): for store staff
6. [Operations](docs/05-OPERATIONS.md): releases, backups, key rotation, troubleshooting
7. [Transfer checklist](docs/06-TRANSFER-CHECKLIST.md): accounts and credentials to hand over
8. [Roadmap](docs/07-ROADMAP.md): known limitations and next steps
9. [Changelog](CHANGELOG.md)
