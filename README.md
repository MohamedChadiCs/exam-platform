# Secure Online Examination Management System

Status: **Full-stack platform complete: Academic CRUD, Question Bank, Exams Management, Code Sharing, Exam Engine, Integrity Monitoring, and Grading.** See "Roadmap".

## Development setup
1. `docker compose up -d` — PostgreSQL 16 + Mailpit (caught emails: http://localhost:8025)
2. `cd server && npm install`
3. `cp .env.example .env`, then `npm run keys` and paste the 3 lines into `.env`; set `ADMIN_PASSWORD` (12+ chars)
4. `npm run db:setup` — applies SQL migrations and seeds (admin, question types, settings, dev CS/L3/WEB301)
5. `npm run dev` — API on http://localhost:4000/api/v1/health
6. `npm test` — 15 integration tests (uses a separate `exam_platform_test` database, created automatically)
7. In a second terminal: `cd client && npm install && npm run dev` — UI on http://localhost:5173
   (the dev server proxies `/api` to :4000, so keep `CLIENT_ORIGIN=http://localhost:5173` — open the UI via `localhost`, not `127.0.0.1`)
8. `cd client && npm test` — 14 UI tests (Vitest + Testing Library)

Log in as the seeded admin (`ADMIN_EMAIL` / `ADMIN_PASSWORD` from `server/.env`). Register students/professors from the UI;
verification and reset emails appear in Mailpit at http://localhost:8025.

## Architecture decisions
- **SQL-first, no ORM.** Schema lives in `server/db/migrations/*/migration.sql`; the `pg` driver is used directly.
  The schema relies on CHECK constraints, partial unique indexes and triggers that ORMs cannot express, and the
  concurrency-critical queries (atomic code redemption, session locking) are hand-written SQL anyway.
  To change the schema, add a new migration folder; never edit an applied one.
- **Opaque server-side sessions** (HttpOnly, SameSite=Lax cookie; only a SHA-256 of the id is stored), instant revocation on ban/logout/password reset.
- **CSRF:** HMAC token bound to the session in `X-CSRF-Token` + Origin check. The token is returned by `/auth/login` and `/auth/me`.
- **No account enumeration:** register and forgot-password answer identically for existing and unknown emails; login errors are uniform and timing-equalised.
- **Append-only** audit/security tables enforced by database triggers.

## API implemented (`/api/v1`)
| Endpoint | Access |
|---|---|
| `GET /health` | public |
| `POST /auth/register` `/auth/verify-email` `/auth/login` `/auth/forgot-password` `/auth/reset-password` | public (rate limited) |
| `POST /auth/logout`, `GET /auth/me` | authenticated (+CSRF on writes) |
| `GET /academic/departments`, `GET /academic/classes`, `GET /academic/courses` | public / read |
| `POST|PUT|DELETE /academic/departments`, `/academic/classes`, `/academic/courses` | admin |
| `GET /admin/users`, `POST /admin/users/:id/suspend` `/unsuspend` `/archive`, `POST /admin/professors/:id/verify`, `GET /admin/audit-logs` | admin |
| `GET|POST /questions`, `GET|PUT|DELETE /questions/:id`, `GET|POST /questions/categories` | professor / admin |
| `GET|POST /exams`, `GET|PUT /exams/:id`, `POST /exams/:id/questions`, `POST /exams/:id/publish` `/close`, `POST /exams/:id/codes` | professor / admin |
| `GET /exams/:id/submissions`, `GET|POST /exams/:id/submissions/:sessionId`, `POST /exams/:id/publish-results` | professor / admin |
| `POST /student/exams/join` | student (8-char code redemption) |
| `GET /student/exams`, `POST /student/exams/:id/start` | student |
| `GET /student/sessions/:id`, `POST /student/sessions/:id/save`, `POST /student/sessions/:id/submit`, `POST /student/sessions/:id/security-event` | student |
| `GET /student/results`, `GET /student/results/:sessionId` | student |

## Roadmap
- [x] 1 Requirements, ERD, schema, API map
- [x] 2a Backend + database foundation
- [x] 3 Auth: register/verify/login/logout/reset, sessions, CSRF, RBAC, ban, audit
- [x] 2b React + Vite + Tailwind client with i18n (ar/fr/en) and RTL
- [x] 3b Auth UI (register, verify, login, forgot/reset) and admin user management UI
- [x] 4 Academic management (admin CRUD for departments, classes, courses)
- [x] 5 Question bank (versioned, Markdown, MCQ single/multi, True/False, Numeric, Short Text)
- [x] 6 Exam management (creation, scheduling, question weights, shuffle, passing scores)
- [x] 7 Code sharing (8-char code + QR, atomic redemption, class restriction)
- [x] 8 Exam engine (server-authoritative countdown timer, autosave, auto-submit)
- [x] 9 Integrity monitoring (focus / visibilitychange tracking & security audit log)
- [x] 10 Grading and results (auto-grading objective questions, manual review, score publishing)
- [x] 11 Automated integration & client test coverage (31 tests passing)

## Client notes
- One font (Readex Pro, self-hosted) covers Arabic and Latin. Layout uses logical utilities only (`ms-*`, `border-e`, `text-start`) so RTL needs no second stylesheet; emails/passwords are forced `dir="ltr"`.
- Route guards are UX only; the API re-checks every permission.
- Dashboards list unbuilt modules as "not built yet" instead of faking them.
- Not yet verified: visual rendering in a real browser (no browser was available when this was built).
