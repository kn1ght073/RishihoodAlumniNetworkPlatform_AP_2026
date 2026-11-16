-- Rishihood Alumni Network MVP schema. PostgreSQL 14 or newer.
-- Run this file manually once against a newly-created database.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE roles (
  id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE CHECK (name IN ('MEMBER', 'ADMIN'))
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL CHECK (length(trim(full_name)) BETWEEN 2 AND 100),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  email_verified_at TIMESTAMPTZ,
  account_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (account_status IN ('ACTIVE', 'SUSPENDED', 'DEACTIVATED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_uq ON users (lower(trim(email)));

CREATE TABLE user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id SMALLINT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE university_memberships (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  university TEXT NOT NULL DEFAULT 'Rishihood University',
  membership_status TEXT NOT NULL CHECK (membership_status IN ('STUDENT', 'ALUMNI')),
  course TEXT NOT NULL CHECK (length(trim(course)) BETWEEN 2 AND 120),
  graduation_year SMALLINT CHECK (graduation_year BETWEEN 2027 AND 2032),
  expected_graduation_year SMALLINT CHECK (expected_graduation_year BETWEEN 2027 AND 2032),
  verification_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
  verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((membership_status = 'STUDENT' AND expected_graduation_year IS NOT NULL) OR (membership_status = 'ALUMNI' AND graduation_year IS NOT NULL))
);

CREATE TABLE profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  avatar_path TEXT,
  current_location TEXT,
  bio TEXT CHECK (bio IS NULL OR length(bio) <= 1200),
  linkedin_url TEXT,
  github_url TEXT,
  portfolio_url TEXT,
  profile_visibility TEXT NOT NULL DEFAULT 'MEMBERS' CHECK (profile_visibility IN ('MEMBERS', 'CONNECTIONS', 'PRIVATE')),
  employment_visibility TEXT NOT NULL DEFAULT 'MEMBERS' CHECK (employment_visibility IN ('MEMBERS', 'CONNECTIONS', 'PRIVATE')),
  contact_visibility TEXT NOT NULL DEFAULT 'PRIVATE' CHECK (contact_visibility IN ('MEMBERS', 'CONNECTIONS', 'PRIVATE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE career_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  open_to_mentoring BOOLEAN NOT NULL DEFAULT FALSE,
  open_to_career_guidance BOOLEAN NOT NULL DEFAULT FALSE,
  open_to_referrals BOOLEAN NOT NULL DEFAULT FALSE,
  mentoring_interests TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE skills (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE user_skills (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id BIGINT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, skill_id)
);

CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 160),
  normalized_name TEXT GENERATED ALWAYS AS (lower(trim(name))) STORED UNIQUE,
  website_url TEXT,
  industry TEXT,
  description TEXT,
  location TEXT,
  size TEXT,
  logo_path TEXT,
  approved BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE employment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  job_title TEXT NOT NULL,
  started_on DATE,
  ended_on DATE,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ended_on IS NULL OR started_on IS NULL OR ended_on >= started_on),
  CHECK (NOT is_current OR ended_on IS NULL)
);
CREATE UNIQUE INDEX employment_current_company_uq ON employment_history(user_id, company_id) WHERE is_current;
CREATE INDEX employment_company_idx ON employment_history(company_id, user_id) WHERE is_current;

CREATE TABLE company_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  normalized_name TEXT GENERATED ALWAYS AS (lower(trim(name))) STORED,
  website_url TEXT,
  industry TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  review_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX company_suggestions_status_idx ON company_suggestions(status, created_at);
CREATE UNIQUE INDEX company_suggestion_pending_name_uq ON company_suggestions(normalized_name) WHERE status = 'PENDING';

CREATE TABLE connection_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (sender_id <> recipient_id)
);
CREATE UNIQUE INDEX connection_request_pending_pair_uq ON connection_requests(LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id)) WHERE status = 'PENDING';

CREATE TABLE connections (
  member_low_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_high_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (member_low_id, member_high_id),
  CHECK (member_low_id < member_high_id)
);

CREATE TABLE career_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('CAREER_GUIDANCE', 'RESUME_REVIEW', 'INTERVIEW_PREP', 'REFERRAL', 'GENERAL_ADVICE')),
  subject TEXT NOT NULL CHECK (length(trim(subject)) BETWEEN 2 AND 160),
  job_url TEXT,
  resume_path TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'NEEDS_INFORMATION', 'IN_PROGRESS', 'REFERRED', 'COMPLETED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (requester_id <> recipient_id)
);
CREATE INDEX career_requests_inbox_idx ON career_requests(recipient_id, status, created_at DESC);
CREATE INDEX career_requests_outbox_idx ON career_requests(requester_id, created_at DESC);
CREATE UNIQUE INDEX career_request_pending_pair_type_uq ON career_requests(requester_id, recipient_id, request_type) WHERE status = 'PENDING';

CREATE TABLE career_request_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES career_requests(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  message TEXT NOT NULL CHECK (length(trim(message)) BETWEEN 1 AND 5000),
  attachment_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX career_messages_request_idx ON career_request_messages(request_id, created_at);

CREATE TABLE mentorship_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  alumnus_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  goals TEXT NOT NULL CHECK (length(trim(goals)) BETWEEN 2 AND 3000),
  topics TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'ENDED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (student_id <> alumnus_id)
);
CREATE INDEX mentorship_inbox_idx ON mentorship_requests(alumnus_id, status, created_at DESC);
CREATE UNIQUE INDEX mentorship_request_pending_pair_uq ON mentorship_requests(student_id, alumnus_id) WHERE status = 'PENDING';

CREATE TABLE opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  job_type TEXT NOT NULL CHECK (job_type IN ('JOB', 'INTERNSHIP', 'HIRING_ANNOUNCEMENT')),
  work_mode TEXT NOT NULL DEFAULT 'ONSITE' CHECK (work_mode IN ('REMOTE', 'HYBRID', 'ONSITE')),
  location TEXT,
  application_url TEXT,
  eligibility TEXT,
  deadline DATE,
  status TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('PUBLISHED', 'CLOSED', 'REMOVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX opportunities_search_idx ON opportunities(status, job_type, created_at DESC);

CREATE TABLE saved_opportunities (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, opportunity_id)
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  reference_id UUID,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_inbox_idx ON notifications(user_id, created_at DESC);

CREATE TABLE verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  evidence_note TEXT NOT NULL,
  document_path TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  admin_reason TEXT,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX verification_status_idx ON verification_requests(status, created_at);
CREATE UNIQUE INDEX verification_pending_user_uq ON verification_requests(user_id) WHERE status = 'PENDING';

CREATE TABLE email_verification_tokens (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Required by connect-pg-simple. Sessions expire naturally; the app never resets this table.
CREATE TABLE user_sessions (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX user_sessions_expire_idx ON user_sessions(expire);
