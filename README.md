# Rishihood Alumni Network

A private professional community connecting Rishihood University students and alumni. Students can find verified alumni by company, role, skills, course, and location; alumni can share experience and opportunities; administrators review university affiliation and maintain a trusted directory.

The application uses plain HTML, CSS, and browser JavaScript, an Express CommonJS API, and PostgreSQL through `pg`. The database, backend, and frontend are independent top-level folders. The backend serves the frontend from the same origin, so no frontend build tool or Docker is required.

## Run locally

1. Install Node.js 20+, npm, and PostgreSQL 14+.
2. Create and seed a local database using [`database/README.md`](database/README.md).
3. Copy `backend/.env.example` to `backend/.env`; set `DATABASE_URL` and a random `SESSION_SECRET` (at least 32 characters).
4. Create the initial administrator: `cd backend && npm install && npm run create-admin`.
5. Start the app: `cd backend && npm run dev`.
6. Open <http://localhost:3000>.

The app never creates, drops, or resets the database on startup. It does not include fake alumni data. Admins add the first approved company and verify members through the app.

## What works

- Student and alumni registration with hashed passwords, one-time email verification, PostgreSQL-backed sessions, login/logout, CSRF checks, and login rate limits.
- Persistent user identity with admin-controlled `STUDENT` to `ALUMNI` transition.
- Profile editing, skills, links, privacy settings, mentoring/career preferences, profile pictures, and employment history.
- Searchable verified alumni and company directories that respect profile and employment visibility.
- Connection requests, private career requests with message threads and status changes, mentorship requests, and job/internship listings with bookmarks.
- In-app notifications, admin statistics, affiliation review, account management, company suggestions, and opportunity moderation with audit records.

See [`docs/SETUP.md`](docs/SETUP.md), [`docs/API.md`](docs/API.md), and [`database/README.md`](database/README.md) for setup, endpoints, schema, migration, backup, and deployment notes.

## Current MVP limits

Email delivery is optional; without SMTP, a development verification code is shown during registration and printed in the backend terminal. Career requests support private PDF resume attachments and threaded replies. Real-time messaging, password recovery, events, and production hosting automation are not included in this first functional MVP. LinkedIn is URL-only; no scraping or unofficial API is used.

## Git history

This workspace blocks writes inside `.git`. The complete incremental history is available in `alumninetwork-m0.bundle`; restore it as a regular checkout with `git clone /path/to/alumninetwork-m0.bundle rishihood-alumni-with-history`.
