# AccessOS — Centralized IAM & Feature Access Control System

Team NEXAGEN · Blaze a Trail 3.0 · PS16 · Deadline: 25 July

## Product
RBAC system where users only see/use features permitted for their role.
Differentiators: (1) adaptive access — flag risky logins (new device, odd hour,
repeated failures), (2) anomaly alerts on the admin dashboard, (3) self-service
access requests reviewed by admins instead of manual permission edits.

## Stack
- Frontend: React.js + Tailwind CSS + Axios (`/frontend`)
- Backend: Node.js + Express.js + JWT + Bcrypt (`/backend`)
- Database: PostgreSQL — schema is locked in `docs/schema.sql`, do not change
  without updating that file and telling the team.

## Conventions
- API contract lives in `docs/api-contract.md`. Follow it exactly — the
  frontend and backend are being built by different people in parallel.
- Every protected backend route uses the `checkPermission(featureName)`
  middleware (`backend/src/middleware/checkPermission.js`).
- Every permission check and admin action gets written to `audit_logs`.
- Env vars go in `.env` (never commit it) — see `.env.example` in each folder.
- Branch naming: `feat/<short-description>`, e.g. `feat/auth`, `feat/admin-ui`.
- Run `npm run dev` inside `backend/` and `frontend/` separately during dev.

## Commands
- Backend: `cd backend && npm install && npm run dev`
- Frontend: `cd frontend && npm install && npm run dev`

## Who owns what (see docs/api-contract.md for the full route table)
- Auth routes — Backend Dev 1
- RBAC/admin routes + audit log — Backend Dev 2
- Rules engine (`backend/src/utils/rulesEngine.js`) + alerts — Lead
- User-side UI — Frontend Dev 1
- Admin-side UI — Frontend Dev 2
