-- ============================================================================
-- Rishihood Alumni Network Platform - Application Queries Catalog
-- File: dbms/04_queries.sql
-- Description: Every SQL query used across the application backend, organized
--              by domain module. Queries utilize JOINs where relationships
--              exist between entities. Every query is marked as -- READ or -- WRITE.
-- Database Target: PostgreSQL 14+
-- ============================================================================


-- ============================================================================
-- SECTION 1: SYSTEM HEALTH & MIDDLEWARE AUTHORIZATION
-- ============================================================================

-- [Q01] Database Readiness / Health Probe (backend/server.js: GET /api/ready)
-- READ
SELECT 1;

-- [Q02] Active Session Validation Middleware (backend/middleware/auth.js: requireAuth)
-- READ
SELECT 1 
FROM users 
WHERE id = $1 AND account_status = 'ACTIVE';

-- [Q03] Role-Based Access Control Verification with JOIN (backend/middleware/auth.js: requireRole)
-- READ
SELECT 1 
FROM user_roles ur 
JOIN roles r ON r.id = ur.role_id
WHERE ur.user_id = $1 AND r.name = $2;

-- [Q04] Affiliation & Admin Verification Status Check with JOIN (backend/middleware/auth.js: requireVerifiedMember)
-- READ
SELECT m.verification_status,
       EXISTS (
         SELECT 1 
         FROM user_roles ur 
         JOIN roles r ON r.id = ur.role_id 
         WHERE ur.user_id = $1 AND r.name = 'ADMIN'
       ) AS is_admin
FROM users u 
LEFT JOIN university_memberships m ON m.user_id = u.id 
WHERE u.id = $1;


-- ============================================================================
-- SECTION 2: AUTHENTICATION & REGISTRATION LIFECYCLE
-- ============================================================================

-- [Q05] Verify Member Role Availability (backend/routes/authRoutes.js: POST /api/auth/register)
-- READ
SELECT 1 
FROM roles 
WHERE name = 'MEMBER';

-- [Q06] Register User Base Account (backend/routes/authRoutes.js: POST /api/auth/register)
-- WRITE
INSERT INTO users (full_name, email, password_hash)
VALUES ($1, $2, $3)
RETURNING id, full_name, email;

-- [Q07] Record University Membership Details (backend/routes/authRoutes.js: POST /api/auth/register)
-- WRITE
INSERT INTO university_memberships (user_id, membership_status, course, graduation_year, expected_graduation_year)
VALUES ($1, $2, $3, $4, $5);

-- [Q08] Initialize User Profile (backend/routes/authRoutes.js: POST /api/auth/register)
-- WRITE
INSERT INTO profiles (user_id) 
VALUES ($1);

-- [Q09] Initialize Career Preferences (backend/routes/authRoutes.js: POST /api/auth/register)
-- WRITE
INSERT INTO career_preferences (user_id) 
VALUES ($1);

-- [Q10] Assign Default Member Role with Lookup (backend/routes/authRoutes.js: POST /api/auth/register)
-- WRITE
INSERT INTO user_roles (user_id, role_id) 
SELECT $1, id 
FROM roles 
WHERE name = 'MEMBER';

-- [Q11] Issue Email Verification Token (backend/routes/authRoutes.js: POST /api/auth/register)
-- WRITE
INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
VALUES ($1, $2, now() + interval '30 minutes');

-- [Q12] Lookup Unverified Account for Resending Token (backend/routes/authRoutes.js: POST /api/auth/resend-verification)
-- READ
SELECT id, full_name 
FROM users 
WHERE lower(trim(email)) = $1 AND email_verified_at IS NULL;

-- [Q13] Invalidate Existing Verification Tokens (backend/routes/authRoutes.js: POST /api/auth/resend-verification)
-- WRITE
DELETE FROM email_verification_tokens 
WHERE user_id = $1;

-- [Q14] Create Fresh Resent Verification Token (backend/routes/authRoutes.js: POST /api/auth/resend-verification)
-- WRITE
INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) 
VALUES ($1, $2, now() + interval '30 minutes');

-- [Q15] Validate and Consume Verification Token (backend/routes/authRoutes.js: POST /api/auth/verify-email)
-- WRITE
DELETE FROM email_verification_tokens 
WHERE token_hash = $1 AND expires_at > now()
RETURNING user_id;

-- [Q16] Mark User Email as Verified (backend/routes/authRoutes.js: POST /api/auth/verify-email)
-- WRITE
UPDATE users 
SET email_verified_at = now(), updated_at = now() 
WHERE id = $1;

-- [Q17] Authenticate User Login with JOIN on Memberships & Roles (backend/routes/authRoutes.js: POST /api/auth/login)
-- READ
SELECT u.id, u.full_name, u.email, u.password_hash, u.email_verified_at, u.account_status,
       m.membership_status,
       EXISTS (
         SELECT 1 
         FROM user_roles ur 
         JOIN roles r ON r.id = ur.role_id 
         WHERE ur.user_id = u.id AND r.name = 'ADMIN'
       ) AS is_admin
FROM users u 
LEFT JOIN university_memberships m ON m.user_id = u.id
WHERE lower(trim(u.email)) = $1;

-- [Q18] Fetch Authenticated User Session Details with JOIN (backend/routes/authRoutes.js: GET /api/auth/me)
-- READ
SELECT u.id, u.full_name, u.email, m.membership_status, m.verification_status,
       EXISTS (
         SELECT 1 
         FROM user_roles ur 
         JOIN roles r ON r.id = ur.role_id 
         WHERE ur.user_id = u.id AND r.name = 'ADMIN'
       ) AS is_admin
FROM users u 
LEFT JOIN university_memberships m ON m.user_id = u.id 
WHERE u.id = $1;


-- ============================================================================
-- SECTION 3: PROFILES, SKILLS, AND EMPLOYMENT
-- ============================================================================

-- [Q19] Fetch Comprehensive User Profile with JOINs on Profiles, Memberships, Career Preferences, and Skills (backend/routes/profileRoutes.js: GET /api/profile)
-- READ
SELECT u.full_name, u.email, p.*, m.university, m.course, m.membership_status, m.graduation_year, m.expected_graduation_year, m.verification_status,
       cp.open_to_mentoring, cp.open_to_career_guidance, cp.open_to_referrals, cp.mentoring_interests,
       COALESCE(array_agg(DISTINCT s.name) FILTER (WHERE s.name IS NOT NULL), '{}') AS skills
FROM users u 
JOIN profiles p ON p.user_id = u.id
JOIN university_memberships m ON m.user_id = u.id
JOIN career_preferences cp ON cp.user_id = u.id
LEFT JOIN user_skills us ON us.user_id = u.id 
LEFT JOIN skills s ON s.id = us.skill_id
WHERE u.id = $1 
GROUP BY u.id, p.user_id, m.user_id, cp.user_id;

-- [Q20] Fetch User Employment History with JOIN on Companies (backend/routes/profileRoutes.js: GET /api/profile)
-- READ
SELECT e.id, e.job_title, e.started_on, e.ended_on, e.is_current, e.verified, c.id AS company_id, c.name AS company_name
FROM employment_history e 
JOIN companies c ON c.id = e.company_id 
WHERE e.user_id = $1 
ORDER BY e.is_current DESC, e.started_on DESC NULLS LAST;

-- [Q21] Update User Full Name (backend/routes/profileRoutes.js: PUT /api/profile)
-- WRITE
UPDATE users 
SET full_name = $2, updated_at = now() 
WHERE id = $1;

-- [Q22] Update Profile Details and Visibility Controls (backend/routes/profileRoutes.js: PUT /api/profile)
-- WRITE
UPDATE profiles 
SET current_location = $2, bio = $3, linkedin_url = $4, github_url = $5, portfolio_url = $6,
    profile_visibility = $7, employment_visibility = $8, contact_visibility = $9, updated_at = now() 
WHERE user_id = $1;

-- [Q23] Update University Course Information (backend/routes/profileRoutes.js: PUT /api/profile)
-- WRITE
UPDATE university_memberships 
SET course = $2, updated_at = now() 
WHERE user_id = $1;

-- [Q24] Update Career Preferences & Mentoring Options (backend/routes/profileRoutes.js: PUT /api/profile)
-- WRITE
UPDATE career_preferences 
SET open_to_mentoring = $2, open_to_career_guidance = $3, open_to_referrals = $4,
    mentoring_interests = $5, updated_at = now() 
WHERE user_id = $1;

-- [Q25] Clear Existing User Skills for Refresh (backend/routes/profileRoutes.js: PUT /api/profile)
-- WRITE
DELETE FROM user_skills 
WHERE user_id = $1;

-- [Q26] Upsert Skill Entry into Global Skills Catalog (backend/routes/profileRoutes.js: PUT /api/profile)
-- WRITE
INSERT INTO skills (name) 
VALUES ($1) 
ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name 
RETURNING id;

-- [Q27] Link User to Skill Tag (backend/routes/profileRoutes.js: PUT /api/profile)
-- WRITE
INSERT INTO user_skills (user_id, skill_id) 
VALUES ($1, $2);

-- [Q28] Check Existing Avatar Path (backend/routes/profileRoutes.js: POST /api/profile/picture)
-- READ
SELECT avatar_path 
FROM profiles 
WHERE user_id = $1;

-- [Q29] Update Profile Picture Path (backend/routes/profileRoutes.js: POST /api/profile/picture)
-- WRITE
UPDATE profiles 
SET avatar_path = $2, updated_at = now() 
WHERE user_id = $1;

-- [Q30] Verify Alumnus Status for Employment Entry (backend/routes/profileRoutes.js: POST /api/profile/employment)
-- READ
SELECT membership_status 
FROM university_memberships 
WHERE user_id = $1;

-- [Q31] Check Approved Company for Employment Entry (backend/routes/profileRoutes.js: POST /api/profile/employment)
-- READ
SELECT 1 
FROM companies 
WHERE id = $1 AND approved = TRUE;

-- [Q32] Add Employment History Entry (backend/routes/profileRoutes.js: POST /api/profile/employment)
-- WRITE
INSERT INTO employment_history (user_id, company_id, job_title, started_on, ended_on, is_current)
VALUES ($1, $2, $3, $4, $5, $6) 
RETURNING id;

-- [Q33] Delete Employment History Entry (backend/routes/profileRoutes.js: DELETE /api/profile/employment/:id)
-- WRITE
DELETE FROM employment_history 
WHERE id = $1 AND user_id = $2;

-- [Q34] Submit Member Affiliation Verification Request (backend/routes/profileRoutes.js: POST /api/profile/verification)
-- WRITE
INSERT INTO verification_requests (user_id, evidence_note) 
VALUES ($1, $2)
ON CONFLICT (user_id) WHERE status = 'PENDING' DO NOTHING 
RETURNING id;

-- [Q35] Read User Avatar with Privacy Check and Connections JOIN (backend/routes/userRoutes.js: GET /api/users/:id/picture)
-- READ
SELECT p.avatar_path, p.profile_visibility,
       EXISTS (
         SELECT 1 
         FROM connections c 
         WHERE c.member_low_id = LEAST($1::uuid, u.id) 
           AND c.member_high_id = GREATEST($1::uuid, u.id)
       ) AS connected
FROM users u 
JOIN profiles p ON p.user_id = u.id 
WHERE u.id = $2 AND u.account_status = 'ACTIVE';

-- [Q36] Read Member Public Profile with JOINs on Profiles, Memberships, and Connections (backend/routes/userRoutes.js: GET /api/users/:id)
-- READ
SELECT u.id, u.full_name, p.avatar_path, p.bio, p.current_location, p.profile_visibility, p.employment_visibility,
       m.course, m.membership_status, m.graduation_year,
       EXISTS (
         SELECT 1 
         FROM connections c 
         WHERE c.member_low_id = LEAST($1::uuid, u.id) 
           AND c.member_high_id = GREATEST($1::uuid, u.id)
       ) AS connected
FROM users u 
JOIN profiles p ON p.user_id = u.id 
LEFT JOIN university_memberships m ON m.user_id = u.id
WHERE u.id = $2 AND u.account_status = 'ACTIVE';


-- ============================================================================
-- SECTION 4: ALUMNI DIRECTORY & SEARCH
-- ============================================================================

-- [Q37] Filtered Alumni Directory Search with multi-table JOINs (backend/routes/alumniRoutes.js: GET /api/alumni)
-- READ
SELECT u.id, u.full_name, p.avatar_path, p.bio, p.current_location, p.profile_visibility,
       p.employment_visibility, m.course, m.graduation_year, cp.open_to_mentoring, cp.mentoring_interests,
       cp.open_to_career_guidance, cp.open_to_referrals,
       CASE WHEN (p.employment_visibility = 'MEMBERS' OR (p.employment_visibility = 'CONNECTIONS' AND EXISTS (
         SELECT 1 FROM connections c WHERE c.member_low_id = LEAST($1::uuid, u.id) AND c.member_high_id = GREATEST($1::uuid, u.id)
       ))) THEN co.name END AS company_name,
       CASE WHEN (p.employment_visibility = 'MEMBERS' OR (p.employment_visibility = 'CONNECTIONS' AND EXISTS (
         SELECT 1 FROM connections c WHERE c.member_low_id = LEAST($1::uuid, u.id) AND c.member_high_id = GREATEST($1::uuid, u.id)
       ))) THEN e.job_title END AS job_title,
       COALESCE((
         SELECT array_agg(s.name ORDER BY s.name) 
         FROM user_skills us 
         JOIN skills s ON s.id = us.skill_id 
         WHERE us.user_id = u.id
       ), '{}') AS skills
FROM users u 
JOIN profiles p ON p.user_id = u.id
JOIN university_memberships m ON m.user_id = u.id
JOIN career_preferences cp ON cp.user_id = u.id
LEFT JOIN employment_history e ON e.user_id = u.id AND e.is_current = TRUE
LEFT JOIN companies co ON co.id = e.company_id
WHERE m.membership_status = 'ALUMNI' 
  AND m.verification_status = 'VERIFIED' 
  AND u.account_status = 'ACTIVE'
  AND p.profile_visibility <> 'PRIVATE'
  AND (p.profile_visibility = 'MEMBERS' OR EXISTS (
    SELECT 1 FROM connections c WHERE c.member_low_id = LEAST($1::uuid, u.id) AND c.member_high_id = GREATEST($1::uuid, u.id)
  ) OR u.id = $1)
  AND ($2 = '%%' OR u.full_name ILIKE $2 OR m.course ILIKE $2 OR ((p.employment_visibility = 'MEMBERS' OR (p.employment_visibility = 'CONNECTIONS' AND EXISTS (
    SELECT 1 FROM connections c WHERE c.member_low_id = LEAST($1::uuid, u.id) AND c.member_high_id = GREATEST($1::uuid, u.id)
  ))) AND (co.name ILIKE $2 OR e.job_title ILIKE $2)))
  AND ($3 = '%%' OR ((p.employment_visibility = 'MEMBERS' OR (p.employment_visibility = 'CONNECTIONS' AND EXISTS (
    SELECT 1 FROM connections c WHERE c.member_low_id = LEAST($1::uuid, u.id) AND c.member_high_id = GREATEST($1::uuid, u.id)
  ))) AND co.name ILIKE $3))
  AND ($4 = '%%' OR ((p.employment_visibility = 'MEMBERS' OR (p.employment_visibility = 'CONNECTIONS' AND EXISTS (
    SELECT 1 FROM connections c WHERE c.member_low_id = LEAST($1::uuid, u.id) AND c.member_high_id = GREATEST($1::uuid, u.id)
  ))) AND e.job_title ILIKE $4))
  AND ($5 = '%%' OR p.current_location ILIKE $5)
  AND ($6 = '%%' OR ((p.employment_visibility = 'MEMBERS' OR (p.employment_visibility = 'CONNECTIONS' AND EXISTS (
    SELECT 1 FROM connections c WHERE c.member_low_id = LEAST($1::uuid, u.id) AND c.member_high_id = GREATEST($1::uuid, u.id)
  ))) AND co.industry ILIKE $6))
  AND ($7 = '%%' OR m.course ILIKE $7)
  AND ($8 = '%%' OR EXISTS (
    SELECT 1 FROM user_skills sx JOIN skills sk ON sk.id = sx.skill_id WHERE sx.user_id = u.id AND sk.name ILIKE $8
  ))
  AND ($9::smallint IS NULL OR m.graduation_year = $9)
GROUP BY u.id, p.user_id, m.user_id, cp.user_id, e.id, co.id
ORDER BY u.full_name ASC 
LIMIT $10 OFFSET $11;

-- [Q38] Single Alumnus Detailed Profile with multi-table JOINs (backend/routes/alumniRoutes.js: GET /api/alumni/:id)
-- READ
SELECT u.id, u.full_name, u.email, p.*, m.university, m.course, m.membership_status, m.graduation_year,
       m.verification_status, cp.open_to_mentoring, cp.open_to_career_guidance, cp.open_to_referrals, cp.mentoring_interests,
       COALESCE((
         SELECT array_agg(s.name ORDER BY s.name) 
         FROM user_skills us 
         JOIN skills s ON s.id = us.skill_id 
         WHERE us.user_id = u.id
       ), '{}') AS skills,
       EXISTS (
         SELECT 1 
         FROM connections c 
         WHERE c.member_low_id = LEAST($1::uuid, u.id) 
           AND c.member_high_id = GREATEST($1::uuid, u.id)
       ) AS connected
FROM users u 
JOIN profiles p ON p.user_id = u.id 
JOIN university_memberships m ON m.user_id = u.id
JOIN career_preferences cp ON cp.user_id = u.id
WHERE u.id = $2 
  AND u.account_status = 'ACTIVE' 
  AND m.membership_status = 'ALUMNI' 
  AND m.verification_status = 'VERIFIED';

-- [Q39] Alumnus Employment Positions with JOIN on Companies (backend/routes/alumniRoutes.js: GET /api/alumni/:id)
-- READ
SELECT e.id, e.job_title, e.started_on, e.ended_on, e.is_current, e.verified, c.id AS company_id, c.name AS company_name
FROM employment_history e 
JOIN companies c ON c.id = e.company_id 
WHERE e.user_id = $1 
ORDER BY e.is_current DESC, e.started_on DESC NULLS LAST;


-- ============================================================================
-- SECTION 5: COMPANIES & EMPLOYER DIRECTORY
-- ============================================================================

-- [Q40] Browse Approved Companies with Alumni Counts and Privacy JOINs (backend/routes/companyRoutes.js: GET /api/companies)
-- READ
SELECT c.id, c.name, c.website_url, c.industry, c.description, c.location, c.size, c.logo_path,
       COUNT(DISTINCT e.user_id) FILTER (
         WHERE m.user_id IS NOT NULL
           AND (p.profile_visibility = 'MEMBERS' OR (p.profile_visibility = 'CONNECTIONS' AND EXISTS (
             SELECT 1 FROM connections cn WHERE cn.member_low_id = LEAST($1::uuid, e.user_id) AND cn.member_high_id = GREATEST($1::uuid, e.user_id)
           )))
           AND (p.employment_visibility = 'MEMBERS' OR (p.employment_visibility = 'CONNECTIONS' AND EXISTS (
             SELECT 1 FROM connections cn WHERE cn.member_low_id = LEAST($1::uuid, e.user_id) AND cn.member_high_id = GREATEST($1::uuid, e.user_id)
           )))
       )::int AS alumni_count
FROM companies c 
LEFT JOIN employment_history e ON e.company_id = c.id AND e.is_current
LEFT JOIN university_memberships m ON m.user_id = e.user_id AND m.membership_status = 'ALUMNI' AND m.verification_status = 'VERIFIED'
LEFT JOIN profiles p ON p.user_id = e.user_id
WHERE c.approved = TRUE AND ($2 = '%%' OR c.name ILIKE $2) AND ($3 = '%%' OR c.industry ILIKE $3)
GROUP BY c.id 
ORDER BY alumni_count DESC, c.name 
LIMIT 100;

-- [Q41] Company Profile by ID (backend/routes/companyRoutes.js: GET /api/companies/:id)
-- READ
SELECT id, name, website_url, industry, description, location, size, logo_path
FROM companies 
WHERE id = $1 AND approved = TRUE;

-- [Q42] List Alumni Employed at Company with JOINs on Employment, Users, Profiles, Memberships, and Career Preferences (backend/routes/companyRoutes.js: GET /api/companies/:id/alumni)
-- READ
SELECT u.id, u.full_name, p.avatar_path, p.bio, m.course, m.graduation_year, e.job_title,
       cp.open_to_mentoring, cp.open_to_career_guidance, cp.open_to_referrals, cp.mentoring_interests,
       COALESCE((
         SELECT array_agg(s.name ORDER BY s.name) 
         FROM user_skills us 
         JOIN skills s ON s.id = us.skill_id 
         WHERE us.user_id = u.id
       ), '{}') AS skills
FROM employment_history e 
JOIN companies c ON c.id = e.company_id
JOIN users u ON u.id = e.user_id 
JOIN profiles p ON p.user_id = u.id
JOIN university_memberships m ON m.user_id = u.id
JOIN career_preferences cp ON cp.user_id = u.id
WHERE e.company_id = $2 
  AND e.is_current = TRUE 
  AND c.approved = TRUE
  AND u.account_status = 'ACTIVE' 
  AND m.membership_status = 'ALUMNI' 
  AND m.verification_status = 'VERIFIED'
  AND (p.profile_visibility = 'MEMBERS' OR (p.profile_visibility = 'CONNECTIONS' AND EXISTS (
    SELECT 1 FROM connections cn WHERE cn.member_low_id = LEAST($1::uuid, u.id) AND cn.member_high_id = GREATEST($1::uuid, u.id)
  )))
  AND (p.employment_visibility = 'MEMBERS' OR (p.employment_visibility = 'CONNECTIONS' AND EXISTS (
    SELECT 1 FROM connections cn WHERE cn.member_low_id = LEAST($1::uuid, u.id) AND cn.member_high_id = GREATEST($1::uuid, u.id)
  )))
ORDER BY u.full_name;

-- [Q43] Check Duplicate Existing Company Name (backend/routes/companyRoutes.js: POST /api/companies/suggestions)
-- READ
SELECT id 
FROM companies 
WHERE normalized_name = lower(trim($1));

-- [Q44] Check Pending Company Suggestion Duplicate (backend/routes/companyRoutes.js: POST /api/companies/suggestions)
-- READ
SELECT id 
FROM company_suggestions 
WHERE normalized_name = lower(trim($1)) AND status = 'PENDING';

-- [Q45] Create New Company Suggestion for Admin Review (backend/routes/companyRoutes.js: POST /api/companies/suggestions)
-- WRITE
INSERT INTO company_suggestions (submitted_by, name, website_url, industry) 
VALUES ($1, $2, $3, $4) 
RETURNING id;


-- ============================================================================
-- SECTION 6: CONNECTIONS & NETWORKING
-- ============================================================================

-- [Q46] Verify Connection Recipient Eligibility with JOIN (backend/routes/connectionRoutes.js: POST /api/connections/request)
-- READ
SELECT u.id 
FROM users u 
JOIN university_memberships m ON m.user_id = u.id
WHERE u.id = $1 AND u.account_status = 'ACTIVE' AND m.verification_status = 'VERIFIED';

-- [Q47] Check Existing Accepted Connection (backend/routes/connectionRoutes.js: POST /api/connections/request)
-- READ
SELECT 1 
FROM connections 
WHERE member_low_id = LEAST($1::uuid, $2::uuid) 
  AND member_high_id = GREATEST($1::uuid, $2::uuid);

-- [Q48] Send Connection Request (backend/routes/connectionRoutes.js: POST /api/connections/request)
-- WRITE
INSERT INTO connection_requests (sender_id, recipient_id) 
VALUES ($1, $2) 
RETURNING id;

-- [Q49] View Connection Requests with JOINs on Sender and Recipient (backend/routes/connectionRoutes.js: GET /api/connections/requests)
-- READ
SELECT cr.id, cr.sender_id, cr.recipient_id, cr.status, cr.created_at,
       sender.full_name AS sender_name, recipient.full_name AS recipient_name
FROM connection_requests cr 
JOIN users sender ON sender.id = cr.sender_id
JOIN users recipient ON recipient.id = cr.recipient_id
WHERE cr.sender_id = $1 OR cr.recipient_id = $1
ORDER BY cr.created_at DESC 
LIMIT 100;

-- [Q50] Lock Connection Request for Status Update (backend/routes/connectionRoutes.js: PUT /api/connections/requests/:id)
-- READ
SELECT * 
FROM connection_requests 
WHERE id = $1 
FOR UPDATE;

-- [Q51] Update Connection Request Status (backend/routes/connectionRoutes.js: PUT /api/connections/requests/:id)
-- WRITE
UPDATE connection_requests 
SET status = $2, updated_at = now() 
WHERE id = $1;

-- [Q52] Establish Bi-directional Connection on Accept (backend/routes/connectionRoutes.js: PUT /api/connections/requests/:id)
-- WRITE
INSERT INTO connections (member_low_id, member_high_id)
SELECT LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id) 
FROM connection_requests 
WHERE id = $1
ON CONFLICT DO NOTHING;

-- [Q53] List Member Connections with JOINs across Connections, Users, Profiles, Memberships, Employment, and Companies (backend/routes/connectionRoutes.js: GET /api/connections)
-- READ
SELECT u.id, u.full_name, p.avatar_path, m.course, m.graduation_year,
       CASE WHEN p.employment_visibility <> 'PRIVATE' THEN e.job_title END AS job_title,
       CASE WHEN p.employment_visibility <> 'PRIVATE' THEN c.name END AS company_name
FROM connections cn 
JOIN users u ON u.id = CASE WHEN cn.member_low_id = $1 THEN cn.member_high_id ELSE cn.member_low_id END
JOIN profiles p ON p.user_id = u.id 
LEFT JOIN university_memberships m ON m.user_id = u.id
LEFT JOIN employment_history e ON e.user_id = u.id AND e.is_current
LEFT JOIN companies c ON c.id = e.company_id
WHERE (cn.member_low_id = $1 OR cn.member_high_id = $1) 
  AND u.account_status = 'ACTIVE'
ORDER BY u.full_name;


-- ============================================================================
-- SECTION 7: MENTORSHIP
-- ============================================================================

-- [Q54] Verify Alumnus Mentorship Eligibility with multi-table JOINs (backend/routes/mentorshipRoutes.js: POST /api/mentorship)
-- READ
SELECT m.membership_status, m.verification_status, cp.open_to_mentoring
FROM university_memberships m 
JOIN career_preferences cp ON cp.user_id = m.user_id
JOIN users u ON u.id = m.user_id 
WHERE m.user_id = $1 AND u.account_status = 'ACTIVE';

-- [Q55] Verify Mentorship Requester Student Status (backend/routes/mentorshipRoutes.js: POST /api/mentorship)
-- READ
SELECT membership_status 
FROM university_memberships 
WHERE user_id = $1;

-- [Q56] Create Mentorship Request (backend/routes/mentorshipRoutes.js: POST /api/mentorship)
-- WRITE
INSERT INTO mentorship_requests (student_id, alumnus_id, goals, topics) 
VALUES ($1, $2, $3, $4) 
RETURNING id;

-- [Q57] View Mentorship Requests with JOINs on Student and Alumnus (backend/routes/mentorshipRoutes.js: GET /api/mentorship)
-- READ
SELECT mr.id, mr.student_id, mr.alumnus_id, mr.goals, mr.topics, mr.status, mr.created_at, mr.updated_at,
       student.full_name AS student_name, alumnus.full_name AS alumnus_name
FROM mentorship_requests mr 
JOIN users student ON student.id = mr.student_id
JOIN users alumnus ON alumnus.id = mr.alumnus_id
WHERE mr.student_id = $1 OR mr.alumnus_id = $1 
ORDER BY mr.updated_at DESC;

-- [Q58] Lock Mentorship Request for State Transition (backend/routes/mentorshipRoutes.js: PUT /api/mentorship/:id)
-- READ
SELECT * 
FROM mentorship_requests 
WHERE id = $1 
FOR UPDATE;

-- [Q59] Update Mentorship Request Status (backend/routes/mentorshipRoutes.js: PUT /api/mentorship/:id)
-- WRITE
UPDATE mentorship_requests 
SET status = $2, updated_at = now() 
WHERE id = $1;


-- ============================================================================
-- SECTION 8: CAREER ASSISTANCE, GUIDANCE & REFERRALS
-- ============================================================================

-- [Q60] Authorization Check for Career Request Access with Admin JOIN (backend/routes/careerRoutes.js: canReadRequest)
-- READ
SELECT cr.requester_id, cr.recipient_id,
       EXISTS (
         SELECT 1 
         FROM user_roles ur 
         JOIN roles r ON r.id = ur.role_id 
         WHERE ur.user_id = $1 AND r.name = 'ADMIN'
       ) AS is_admin
FROM career_requests cr 
WHERE cr.id = $2;

-- [Q61] Verify Alumnus Availability for Career Request with JOINs (backend/routes/careerRoutes.js: POST /api/career-requests)
-- READ
SELECT m.membership_status, m.verification_status, cp.open_to_career_guidance AS open_to_request
FROM university_memberships m 
JOIN career_preferences cp ON cp.user_id = m.user_id
JOIN users u ON u.id = m.user_id 
WHERE m.user_id = $1 AND u.account_status = 'ACTIVE';

-- [Q62] Verify Requester is a Student (backend/routes/careerRoutes.js: POST /api/career-requests)
-- READ
SELECT membership_status 
FROM university_memberships 
WHERE user_id = $1;

-- [Q63] Create Career Assistance Request (backend/routes/careerRoutes.js: POST /api/career-requests)
-- WRITE
INSERT INTO career_requests (requester_id, recipient_id, company_id, request_type, subject, job_url, resume_path)
VALUES ($1, $2, $3, $4, $5, $6, $7) 
RETURNING id;

-- [Q64] Insert Initial Conversation Message for Career Request (backend/routes/careerRoutes.js: POST /api/career-requests)
-- WRITE
INSERT INTO career_request_messages (request_id, sender_id, message) 
VALUES ($1, $2, $3);

-- [Q65] Get Resume Path for Download (backend/routes/careerRoutes.js: GET /api/career-requests/:id/resume)
-- READ
SELECT resume_path 
FROM career_requests 
WHERE id = $1;

-- [Q66] List Member Career Requests with JOINs on Requester and Recipient (backend/routes/careerRoutes.js: GET /api/career-requests)
-- READ
SELECT cr.id, cr.requester_id, cr.recipient_id, cr.request_type, cr.subject, cr.job_url, cr.status, cr.created_at, cr.updated_at,
       requester.full_name AS requester_name, recipient.full_name AS recipient_name
FROM career_requests cr 
JOIN users requester ON requester.id = cr.requester_id
JOIN users recipient ON recipient.id = cr.recipient_id
WHERE cr.requester_id = $1 OR cr.recipient_id = $1
ORDER BY cr.updated_at DESC;

-- [Q67] Get Single Career Request Detail with JOINs on Users (backend/routes/careerRoutes.js: GET /api/career-requests/:id)
-- READ
SELECT cr.*, requester.full_name AS requester_name, recipient.full_name AS recipient_name
FROM career_requests cr 
JOIN users requester ON requester.id = cr.requester_id
JOIN users recipient ON recipient.id = cr.recipient_id 
WHERE cr.id = $1;

-- [Q68] Get Career Request Thread Messages with JOIN on Users (backend/routes/careerRoutes.js: GET /api/career-requests/:id)
-- READ
SELECT cm.id, cm.sender_id, u.full_name AS sender_name, cm.message, cm.attachment_path, cm.created_at
FROM career_request_messages cm 
JOIN users u ON u.id = cm.sender_id
WHERE cm.request_id = $1 
ORDER BY cm.created_at;

-- [Q69] Lock Career Request for Status Transition (backend/routes/careerRoutes.js: PUT /api/career-requests/:id/status)
-- READ
SELECT * 
FROM career_requests 
WHERE id = $1 
FOR UPDATE;

-- [Q70] Update Career Request Status (backend/routes/careerRoutes.js: PUT /api/career-requests/:id/status)
-- WRITE
UPDATE career_requests 
SET status = $2, updated_at = now() 
WHERE id = $1;

-- [Q71] Fetch Career Request State Before Message Reply (backend/routes/careerRoutes.js: POST /api/career-requests/:id/messages)
-- READ
SELECT requester_id, recipient_id, status 
FROM career_requests 
WHERE id = $1;

-- [Q72] Append Message to Career Request Thread (backend/routes/careerRoutes.js: POST /api/career-requests/:id/messages)
-- WRITE
INSERT INTO career_request_messages (request_id, sender_id, message) 
VALUES ($1, $2, $3) 
RETURNING id, created_at;

-- [Q73] Touch Career Request Updated Timestamp (backend/routes/careerRoutes.js: POST /api/career-requests/:id/messages)
-- WRITE
UPDATE career_requests 
SET updated_at = now() 
WHERE id = $1;


-- ============================================================================
-- SECTION 9: OPPORTUNITIES & JOB BOARD
-- ============================================================================

-- [Q74] Browse and Filter Published Opportunities with JOINs on Users, Companies, and Saved Status (backend/routes/opportunityRoutes.js: GET /api/opportunities)
-- READ
SELECT o.id, o.title, o.description, o.job_type, o.work_mode, o.location, o.application_url,
       o.eligibility, o.deadline, o.status, o.created_at, o.publisher_id, u.full_name AS publisher_name,
       c.id AS company_id, c.name AS company_name,
       EXISTS (
         SELECT 1 
         FROM saved_opportunities so 
         WHERE so.user_id = $1 AND so.opportunity_id = o.id
       ) AS saved
FROM opportunities o 
JOIN users u ON u.id = o.publisher_id 
LEFT JOIN companies c ON c.id = o.company_id
WHERE o.status = 'PUBLISHED' 
  AND (o.deadline IS NULL OR o.deadline >= CURRENT_DATE)
  AND ($2 = '%%' OR o.title ILIKE $2 OR c.name ILIKE $2)
  AND ($3::text IS NULL OR o.job_type = $3) 
  AND ($4::text IS NULL OR o.work_mode = $4)
  AND ($5 = '%%' OR o.location ILIKE $5)
ORDER BY o.created_at DESC 
LIMIT 100;

-- [Q75] Opportunity Detail by ID with JOINs on Users, Companies, and Saved Status (backend/routes/opportunityRoutes.js: GET /api/opportunities/:id)
-- READ
SELECT o.*, u.full_name AS publisher_name, c.name AS company_name,
       EXISTS (
         SELECT 1 
         FROM saved_opportunities so 
         WHERE so.user_id = $1 AND so.opportunity_id = o.id
       ) AS saved
FROM opportunities o 
JOIN users u ON u.id = o.publisher_id 
LEFT JOIN companies c ON c.id = o.company_id
WHERE o.id = $2 AND (o.status = 'PUBLISHED' OR o.publisher_id = $1);

-- [Q76] Verify Publisher Eligibility for Posting Opportunity (backend/routes/opportunityRoutes.js: POST /api/opportunities)
-- READ
SELECT membership_status, verification_status 
FROM university_memberships 
WHERE user_id = $1;

-- [Q77] Verify Company is Approved for Opportunity (backend/routes/opportunityRoutes.js: POST /api/opportunities & PUT /api/opportunities/:id)
-- READ
SELECT 1 
FROM companies 
WHERE id = $1 AND approved = TRUE;

-- [Q78] Post Opportunity (backend/routes/opportunityRoutes.js: POST /api/opportunities)
-- WRITE
INSERT INTO opportunities (publisher_id, company_id, title, description, job_type, work_mode, location, application_url, eligibility, deadline)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
RETURNING id;

-- [Q79] Update Opportunity with Authorization Role JOIN Check (backend/routes/opportunityRoutes.js: PUT /api/opportunities/:id)
-- WRITE
UPDATE opportunities 
SET company_id = $3, title = $4, description = $5, job_type = $6, work_mode = $7, location = $8,
    application_url = $9, eligibility = $10, deadline = $11, status = $12, updated_at = now()
WHERE id = $1 
  AND (publisher_id = $2 OR EXISTS (
    SELECT 1 
    FROM user_roles ur 
    JOIN roles r ON r.id = ur.role_id 
    WHERE ur.user_id = $2 AND r.name = 'ADMIN'
  )) 
RETURNING id;

-- [Q80] Soft Delete Opportunity (backend/routes/opportunityRoutes.js: DELETE /api/opportunities/:id)
-- WRITE
UPDATE opportunities 
SET status = 'REMOVED', updated_at = now() 
WHERE id = $1 
  AND (publisher_id = $2 OR EXISTS (
    SELECT 1 
    FROM user_roles ur 
    JOIN roles r ON r.id = ur.role_id 
    WHERE ur.user_id = $2 AND r.name = 'ADMIN'
  )) 
RETURNING id;

-- [Q81] Bookmark / Save Opportunity (backend/routes/opportunityRoutes.js: POST /api/opportunities/:id/save)
-- WRITE
INSERT INTO saved_opportunities (user_id, opportunity_id)
SELECT $1, id 
FROM opportunities 
WHERE id = $2 AND status = 'PUBLISHED'
ON CONFLICT DO NOTHING 
RETURNING opportunity_id;

-- [Q82] Check Existing Bookmark Status (backend/routes/opportunityRoutes.js: POST /api/opportunities/:id/save)
-- READ
SELECT 1 
FROM saved_opportunities 
WHERE user_id = $1 AND opportunity_id = $2;

-- [Q83] Unbookmark Opportunity (backend/routes/opportunityRoutes.js: POST /api/opportunities/:id/save)
-- WRITE
DELETE FROM saved_opportunities 
WHERE user_id = $1 AND opportunity_id = $2;


-- ============================================================================
-- SECTION 10: NOTIFICATIONS
-- ============================================================================

-- [Q84] Create Notification (backend/services/notificationService.js: notify)
-- WRITE
INSERT INTO notifications (user_id, notification_type, title, body, reference_id)
VALUES ($1, $2, $3, $4, $5);

-- [Q85] List User Notifications (backend/routes/notificationRoutes.js: GET /api/notifications)
-- READ
SELECT id, notification_type, title, body, reference_id, read_at, created_at
FROM notifications 
WHERE user_id = $1 
ORDER BY created_at DESC 
LIMIT 100;

-- [Q86] Mark All Notifications Read (backend/routes/notificationRoutes.js: PUT /api/notifications/read-all)
-- WRITE
UPDATE notifications 
SET read_at = now() 
WHERE user_id = $1 AND read_at IS NULL;

-- [Q87] Mark Single Notification Read (backend/routes/notificationRoutes.js: PUT /api/notifications/:id/read)
-- WRITE
UPDATE notifications 
SET read_at = now() 
WHERE id = $1 AND user_id = $2 
RETURNING id;


-- ============================================================================
-- SECTION 11: ADMIN CONSOLE, VERIFICATIONS, AND AUDIT LOGS
-- ============================================================================

-- [Q88] Admin Dashboard Aggregate Metrics (backend/routes/adminRoutes.js: GET /api/admin/dashboard)
-- READ
SELECT
  (SELECT count(*)::int FROM users WHERE account_status = 'ACTIVE') AS total_users,
  (SELECT count(*)::int FROM university_memberships WHERE membership_status = 'STUDENT') AS students,
  (SELECT count(*)::int FROM university_memberships WHERE membership_status = 'ALUMNI') AS alumni,
  (SELECT count(*)::int FROM verification_requests WHERE status = 'PENDING') AS pending_verifications,
  (SELECT count(*)::int FROM companies WHERE approved) AS companies,
  (SELECT count(*)::int FROM career_requests) AS career_requests,
  (SELECT count(*)::int FROM mentorship_requests) AS mentorship_requests,
  (SELECT count(*)::int FROM opportunities WHERE status = 'PUBLISHED') AS opportunities;

-- [Q89] Admin Monitor Career Requests with JOINs on Requester and Recipient (backend/routes/adminRoutes.js: GET /api/admin/career-requests)
-- READ
SELECT cr.id, cr.request_type, cr.subject, cr.status, cr.created_at, cr.updated_at,
       requester.full_name AS requester_name, recipient.full_name AS recipient_name
FROM career_requests cr 
JOIN users requester ON requester.id = cr.requester_id
JOIN users recipient ON recipient.id = cr.recipient_id 
ORDER BY cr.updated_at DESC 
LIMIT 100;

-- [Q90] Admin Search Users with LEFT JOIN on University Memberships (backend/routes/adminRoutes.js: GET /api/admin/users)
-- READ
SELECT u.id, u.full_name, u.email, u.account_status, u.email_verified_at, u.created_at,
       m.membership_status, m.course, m.graduation_year, m.expected_graduation_year, m.verification_status
FROM users u 
LEFT JOIN university_memberships m ON m.user_id = u.id
WHERE ($1 = '%%' OR u.full_name ILIKE $1 OR u.email ILIKE $1)
ORDER BY u.created_at DESC 
LIMIT 200;

-- [Q91] Lock Membership Row for Admin Transition (backend/routes/adminRoutes.js: PUT /api/admin/users/:id/status)
-- READ
SELECT membership_status 
FROM university_memberships 
WHERE user_id = $1 
FOR UPDATE;

-- [Q92] Admin Update Membership (Student -> Alumni / Year Change) (backend/routes/adminRoutes.js: PUT /api/admin/users/:id/status)
-- WRITE
UPDATE university_memberships 
SET membership_status = $2, graduation_year = $3,
    expected_graduation_year = $4, verification_status = 'VERIFIED', verified_by = $5, verified_at = now(), updated_at = now()
WHERE user_id = $1;

-- [Q93] Append Audit Log for Membership Change (backend/routes/adminRoutes.js: PUT /api/admin/users/:id/status)
-- WRITE
INSERT INTO audit_logs (actor_id, action, target_type, target_id, reason) 
VALUES ($1, 'MEMBERSHIP_CHANGED', 'USER', $2, $3);

-- [Q94] Admin Update User Account Status (Active/Suspended) (backend/routes/adminRoutes.js: PUT /api/admin/users/:id/account)
-- WRITE
UPDATE users 
SET account_status = $2, updated_at = now() 
WHERE id = $1 
RETURNING id;

-- [Q95] Append Audit Log for Account Status Change (backend/routes/adminRoutes.js: PUT /api/admin/users/:id/account)
-- WRITE
INSERT INTO audit_logs (actor_id, action, target_type, target_id, reason) 
VALUES ($1, 'ACCOUNT_STATUS_CHANGED', 'USER', $2, $3);

-- [Q96] List Pending Affiliation Verifications with JOINs on Users and Memberships (backend/routes/adminRoutes.js: GET /api/admin/verifications)
-- READ
SELECT vr.id, vr.user_id, vr.evidence_note, vr.document_path, vr.status, vr.created_at,
       u.full_name, u.email, m.membership_status, m.course, m.graduation_year, m.expected_graduation_year
FROM verification_requests vr 
JOIN users u ON u.id = vr.user_id
LEFT JOIN university_memberships m ON m.user_id = u.id
WHERE vr.status = 'PENDING' 
ORDER BY vr.created_at;

-- [Q97] Lock Pending Verification for Review (backend/routes/adminRoutes.js: PUT /api/admin/verifications/:id)
-- READ
SELECT * 
FROM verification_requests 
WHERE id = $1 AND status = 'PENDING' 
FOR UPDATE;

-- [Q98] Admin Update Verification Request Status (backend/routes/adminRoutes.js: PUT /api/admin/verifications/:id)
-- WRITE
UPDATE verification_requests 
SET status = $2, admin_reason = $3, reviewed_by = $4, reviewed_at = now() 
WHERE id = $1;

-- [Q99] Admin Update University Membership Verification Status (backend/routes/adminRoutes.js: PUT /api/admin/verifications/:id)
-- WRITE
UPDATE university_memberships 
SET verification_status = $2, verified_by = $3, verified_at = now(), updated_at = now() 
WHERE user_id = $1;

-- [Q100] Append Audit Log for Verification Review (backend/routes/adminRoutes.js: PUT /api/admin/verifications/:id)
-- WRITE
INSERT INTO audit_logs (actor_id, action, target_type, target_id, reason) 
VALUES ($1, 'VERIFICATION_REVIEWED', 'VERIFICATION', $2, $3);

-- [Q101] List Pending Company Suggestions with JOIN on Users (backend/routes/adminRoutes.js: GET /api/admin/company-suggestions)
-- READ
SELECT cs.id, cs.name, cs.website_url, cs.industry, cs.created_at, u.full_name AS submitted_by_name
FROM company_suggestions cs 
JOIN users u ON u.id = cs.submitted_by
WHERE cs.status = 'PENDING' 
ORDER BY cs.created_at;

-- [Q102] Lock Pending Company Suggestion for Review (backend/routes/adminRoutes.js: PUT /api/admin/company-suggestions/:id)
-- READ
SELECT * 
FROM company_suggestions 
WHERE id = $1 AND status = 'PENDING' 
FOR UPDATE;

-- [Q103] Admin Approve & Insert Company from Suggestion (backend/routes/adminRoutes.js: PUT /api/admin/company-suggestions/:id)
-- WRITE
INSERT INTO companies (name, website_url, industry) 
VALUES ($1, $2, $3)
ON CONFLICT (normalized_name) DO UPDATE SET name = companies.name 
RETURNING id;

-- [Q104] Admin Update Company Suggestion Status (backend/routes/adminRoutes.js: PUT /api/admin/company-suggestions/:id)
-- WRITE
UPDATE company_suggestions 
SET status = $2, reviewed_by = $3, review_reason = $4, reviewed_at = now() 
WHERE id = $1;

-- [Q105] Append Audit Log for Company Suggestion Review (backend/routes/adminRoutes.js: PUT /api/admin/company-suggestions/:id)
-- WRITE
INSERT INTO audit_logs (actor_id, action, target_type, target_id, reason) 
VALUES ($1, 'COMPANY_SUGGESTION_REVIEWED', 'COMPANY_SUGGESTION', $2, $3);

-- [Q106] Admin List All Companies (backend/routes/adminRoutes.js: GET /api/admin/companies)
-- READ
SELECT id, name, website_url, industry, description, location, size, approved 
FROM companies 
ORDER BY name 
LIMIT 500;

-- [Q107] Admin Update Company Profile (backend/routes/adminRoutes.js: PUT /api/admin/companies/:id)
-- WRITE
UPDATE companies 
SET name = $1, website_url = $2, industry = $3, description = $4, location = $5, size = $6 
WHERE id = $7 
RETURNING id;

-- [Q108] Append Audit Log for Company Update (backend/routes/adminRoutes.js: PUT /api/admin/companies/:id)
-- WRITE
INSERT INTO audit_logs (actor_id, action, target_type, target_id) 
VALUES ($1, 'COMPANY_UPDATED', 'COMPANY', $2);

-- [Q109] Admin List Opportunities with JOINs on Users and Companies (backend/routes/adminRoutes.js: GET /api/admin/opportunities)
-- READ
SELECT o.id, o.title, o.job_type, o.status, o.created_at, u.full_name AS publisher_name, c.name AS company_name
FROM opportunities o 
JOIN users u ON u.id = o.publisher_id 
LEFT JOIN companies c ON c.id = o.company_id
WHERE ($1::text IS NULL OR o.status = $1) 
ORDER BY o.created_at DESC 
LIMIT 200;

-- [Q110] Admin Moderate Opportunity Status (backend/routes/adminRoutes.js: PUT /api/admin/opportunities/:id/moderate)
-- WRITE
UPDATE opportunities 
SET status = $2, updated_at = now() 
WHERE id = $1 
RETURNING id;

-- [Q111] Append Audit Log for Opportunity Moderation (backend/routes/adminRoutes.js: PUT /api/admin/opportunities/:id/moderate)
-- WRITE
INSERT INTO audit_logs (actor_id, action, target_type, target_id, reason) 
VALUES ($1, 'OPPORTUNITY_MODERATED', 'OPPORTUNITY', $2, $3);


-- ============================================================================
-- SECTION 12: SYSTEM SETUP & BOOTSTRAP SCRIPTS
-- ============================================================================

-- [Q112] Check Admin Exists with Role JOIN (backend/scripts/create-admin.js)
-- READ
SELECT 1 
FROM user_roles ur 
JOIN roles r ON r.id = ur.role_id 
WHERE r.name = 'ADMIN' 
LIMIT 1;

-- [Q113] Create Bootstrap Admin User Account (backend/scripts/create-admin.js)
-- WRITE
INSERT INTO users (full_name, email, password_hash, email_verified_at) 
VALUES ($1, $2, $3, now()) 
RETURNING id;

-- [Q114] Initialize Admin User Profile (backend/scripts/create-admin.js)
-- WRITE
INSERT INTO profiles (user_id) 
VALUES ($1);

-- [Q115] Grant Admin Role via Subquery Lookup (backend/scripts/create-admin.js)
-- WRITE
INSERT INTO user_roles (user_id, role_id) 
SELECT $1, id 
FROM roles 
WHERE name = 'ADMIN';
