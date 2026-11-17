# Database Normalization

This note explains the PostgreSQL MVP schema in `database/schema.sql`. The main idea is to store each fact once, then connect related facts with primary and foreign keys. The app still uses one permanent account when a student becomes an alumnus.

## Main functional dependencies

- `users.id -> full_name, email, password_hash, account_status`; normalized email is unique.
- `roles.id -> name`; a member can have one or more access roles through `user_roles(user_id, role_id)`.
- `university_memberships.user_id -> university, membership_status, course, cohort year, verification`; university status is separate from the authorization role.
- `profiles.user_id -> bio, location, profile links, avatar path, privacy settings`.
- `career_preferences.user_id -> mentorship, career guidance, and referral availability`.
- `companies.id -> name, website, industry, description, and other company details`; `normalized_name` is generated and unique so equivalent capitalization/spacing cannot create duplicate companies.
- `employment_history.id -> user_id, company_id, job title, dates, verification`; each job is its own row.
- `career_requests.id -> requester, recipient, request type, subject, related company/job URL, status`; conversation entries are stored as separate rows in `career_request_messages`.
- `opportunities.id -> publisher, company, role details, type, work mode, deadline, status`; bookmarks use the composite key `(user_id, opportunity_id)`.

## First normal form

Each column stores one value and every table has a key. Skills are not stored as comma-separated text: names live in `skills`, and `user_skills` connects a member to each skill. Employment positions and request messages each use one row per fact.

## Second normal form

Tables with composite primary keys store facts that depend on the whole key. `user_roles.assigned_at` depends on both `(user_id, role_id)`. A saved timestamp depends on the full `(user_id, opportunity_id)` pair. There are no non-key facts in those tables that depend only on one part of the key.

## Third normal form

Non-key attributes describe only their table's key. Role names, skill names, and company names live in catalogs and are referenced by IDs. Profile data is separate from account credentials. Membership status and course details are separate from career roles. Messages are separate from requests, avoiding duplicated message text in both a request row and a conversation row. Notifications reference a user and an event; they do not copy that event's private request body.

## Integrity and privacy

- Foreign keys prevent orphan records; delete rules preserve career/audit history where needed.
- Unique normalized emails and generated company names prevent duplicates.
- Check constraints validate role, status, request type, visibility, and work-mode values.
- Partial unique indexes prevent multiple current roles at the same company, duplicate pending connections/career requests/mentorship requests, or repeated pending verifications.
- Accepted connections store a canonical low/high user pair, so the relationship is undirected and unique.
- Query filters enforce profile and employment visibility; picture downloads pass through an authenticated API route.

## Presentation-friendly summary

The model separates **who the person is** (`users`), **their university chapter** (`university_memberships`), **what they share professionally** (`profiles`, `skills`, `employment_history`), and **how they interact** (requests, connections, opportunities, notifications). This makes the student-to-alumni transition an update to one membership row rather than a second account.
