# Query Timings & Execution Plan Analysis

**Project:** Rishihood Alumni Network Platform (`AP_2026`) · **Course:** DBMS · **Phase 4 (CP4)**

All 115 application queries from [`dbms/04_queries.sql`](04_queries.sql) were benchmarked against the PostgreSQL database (`rishihood_alumni`).
Each query was executed **3 times** with `EXPLAIN (ANALYZE, BUFFERS)` to capture precise execution times, memory/buffer usage, and scan node operations.
All write queries and parameterized DML statements were benchmarked inside isolated transaction blocks (`BEGIN ... ROLLBACK;`) to ensure zero persistent side-effects and identical state across iterations.

The raw execution plans for all 3 runs of each query are committed in [`dbms/plans/`](plans/).

---

## 1. Summary Metrics

- **Total Queries Benchmarked:** 115 (58 READ, 57 WRITE)
- **Total Workload Execution Time (Sum of Averages):** 16.905 ms
  - **READ Workload Total Time:** 2.727 ms (Mean: 0.047 ms / query)
  - **WRITE Workload Total Time:** 14.178 ms (Mean: 0.249 ms / query)
- **Database Engine:** PostgreSQL 18.x (Apple Silicon)
- **Buffer Strategy:** Execution time measured with shared hit / disk read buffer instrumentation.

---

## 2. Query Timings Table (All 115 Queries)

| Query | Type | What it does | Run 1 (ms) | Run 2 (ms) | Run 3 (ms) | Average (ms) | Scan type |
|---|---|---|---:|---:|---:|---:|---|
| Q01 | READ | Database Readiness / Health Probe | 0.018 | 0.014 | 0.022 | 0.018 | — |
| Q02 | READ | Active Session Validation Middleware | 0.033 | 0.021 | 0.019 | 0.024 | Index Scan using users_pkey on users |
| Q03 | READ | Role-Based Access Control Verification with JOIN | 0.031 | 0.030 | 0.043 | 0.035 | Index Scan using roles_name_key on roles | Index Only Scan using user_roles_pkey on user_roles |
| Q04 | READ | Affiliation & Admin Verification Status Check with JOIN | 0.043 | 0.044 | 0.043 | 0.043 | Index Scan using roles_name_key on roles | Index Only Scan using user_roles_pkey on user_roles | Index Only Scan using users_pkey on users | Index Scan using university_memberships_pkey on university_memberships |
| Q05 | READ | Verify Member Role Availability | 0.022 | 0.022 | 0.021 | 0.022 | Index Only Scan using roles_name_key on roles |
| Q06 | WRITE | Register User Base Account | 0.237 | 0.147 | 0.166 | 0.183 | — |
| Q07 | WRITE | Record University Membership Details | 0.260 | 0.238 | 0.241 | 0.246 | — |
| Q08 | WRITE | Initialize User Profile | 0.258 | 0.293 | 0.230 | 0.260 | — |
| Q09 | WRITE | Initialize Career Preferences | 0.399 | 0.209 | 0.255 | 0.288 | — |
| Q10 | WRITE | Assign Default Member Role with Lookup | 0.215 | 0.186 | 0.250 | 0.217 | Index Scan using roles_name_key on roles |
| Q11 | WRITE | Issue Email Verification Token | 0.319 | 0.322 | 0.394 | 0.345 | — |
| Q12 | READ | Lookup Unverified Account for Resending Token | 0.021 | 0.021 | 0.022 | 0.021 | Index Scan using users_email_lower_uq on users |
| Q13 | WRITE | Invalidate Existing Verification Tokens | 0.058 | 0.060 | 0.044 | 0.054 | Seq Scan on email_verification_tokens |
| Q14 | WRITE | Create Fresh Resent Verification Token | 0.368 | 0.359 | 0.321 | 0.349 | — |
| Q15 | WRITE | Validate and Consume Verification Token | 0.057 | 0.054 | 0.056 | 0.056 | Index Scan using email_verification_tokens_token_hash_key on email_verification_tokens |
| Q16 | WRITE | Mark User Email as Verified | 0.133 | 0.144 | 0.141 | 0.139 | Index Scan using users_pkey on users |
| Q17 | READ | Authenticate User Login with JOIN on Memberships & Roles | 0.058 | 0.044 | 0.095 | 0.066 | Index Scan using users_email_lower_uq on users | Index Scan using university_memberships_pkey on university_memberships | Index Scan using roles_name_key on roles | Index Only Scan using user_roles_pkey on user_roles |
| Q18 | READ | Fetch Authenticated User Session Details with JOIN | 0.038 | 0.050 | 0.037 | 0.042 | Index Scan using users_pkey on users | Index Scan using university_memberships_pkey on university_memberships | Index Scan using roles_name_key on roles | Index Only Scan using user_roles_pkey on user_roles |
| Q19 | READ | Fetch Comprehensive User Profile with JOINs on Profiles, Memberships, Career Preferences, and Skills | 0.113 | 0.123 | 0.090 | 0.109 | Index Scan using users_pkey on users | Index Scan using profiles_pkey on profiles | Index Scan using university_memberships_pkey on university_memberships | Index Scan using career_preferences_pkey on career_preferences | Seq Scan on user_skills | Index Scan using skills_pkey on skills |
| Q20 | READ | Fetch User Employment History with JOIN on Companies | 0.081 | 0.049 | 0.048 | 0.059 | Seq Scan on companies | Seq Scan on employment_history |
| Q21 | WRITE | Update User Full Name | 0.165 | 0.136 | 0.131 | 0.144 | Index Scan using users_pkey on users |
| Q22 | WRITE | Update Profile Details and Visibility Controls | 0.107 | 0.113 | 0.129 | 0.116 | Index Scan using profiles_pkey on profiles |
| Q23 | WRITE | Update University Course Information | 0.120 | 0.121 | 0.155 | 0.132 | Index Scan using university_memberships_pkey on university_memberships |
| Q24 | WRITE | Update Career Preferences & Mentoring Options | 0.085 | 0.100 | 0.079 | 0.088 | Index Scan using career_preferences_pkey on career_preferences |
| Q25 | WRITE | Clear Existing User Skills for Refresh | 0.053 | 0.059 | 0.059 | 0.057 | Seq Scan on user_skills |
| Q26 | WRITE | Upsert Skill Entry into Global Skills Catalog | 0.112 | 0.119 | 0.117 | 0.116 | — |
| Q27 | WRITE | Link User to Skill Tag | 0.510 | 0.450 | 0.412 | 0.457 | — |
| Q28 | READ | Check Existing Avatar Path | 0.033 | 0.016 | 0.017 | 0.022 | Index Scan using profiles_pkey on profiles |
| Q29 | WRITE | Update Profile Picture Path | 0.137 | 0.145 | 0.140 | 0.141 | Index Scan using profiles_pkey on profiles |
| Q30 | READ | Verify Alumnus Status for Employment Entry | 0.022 | 0.026 | 0.017 | 0.022 | Index Scan using university_memberships_pkey on university_memberships |
| Q31 | READ | Check Approved Company for Employment Entry | 0.020 | 0.018 | 0.018 | 0.019 | Index Scan using companies_pkey on companies |
| Q32 | WRITE | Add Employment History Entry | 0.523 | 0.500 | 0.744 | 0.589 | — |
| Q33 | WRITE | Delete Employment History Entry | 0.056 | 0.055 | 0.056 | 0.056 | Index Scan using employment_history_pkey on employment_history |
| Q34 | WRITE | Submit Member Affiliation Verification Request | 0.341 | 0.445 | 0.354 | 0.380 | — |
| Q35 | READ | Read User Avatar with Privacy Check and Connections JOIN | 0.075 | 0.069 | 0.074 | 0.073 | Index Scan using users_pkey on users | Index Scan using profiles_pkey on profiles | Index Only Scan using connections_pkey on connections |
| Q36 | READ | Read Member Public Profile with JOINs on Profiles, Memberships, and Connections | 0.049 | 0.053 | 0.045 | 0.049 | Index Scan using users_pkey on users | Index Scan using profiles_pkey on profiles | Index Scan using university_memberships_pkey on university_memberships | Index Only Scan using connections_pkey on connections |
| Q37 | READ | Filtered Alumni Directory Search with multi-table JOINs | 0.215 | 0.213 | 0.284 | 0.237 | Seq Scan on profiles | Seq Scan on users | Index Only Scan using connections_pkey on connections | Bitmap Heap Scan on employment_history | Bitmap Index Scan on employment_current_company_uq | Index Scan using companies_pkey on companies | Index Scan using career_preferences_pkey on career_preferences | Index Scan using university_memberships_pkey on university_memberships | Seq Scan on user_skills | Index Scan using skills_pkey on skills |
| Q38 | READ | Single Alumnus Detailed Profile with multi-table JOINs | 0.137 | 0.118 | 0.125 | 0.127 | Index Scan using users_pkey on users | Index Scan using profiles_pkey on profiles | Index Scan using university_memberships_pkey on university_memberships | Index Scan using career_preferences_pkey on career_preferences | Seq Scan on user_skills | Index Scan using skills_pkey on skills | Index Only Scan using connections_pkey on connections |
| Q39 | READ | Alumnus Employment Positions with JOIN on Companies | 0.042 | 0.067 | 0.046 | 0.052 | Seq Scan on companies | Seq Scan on employment_history |
| Q40 | READ | Browse Approved Companies with Alumni Counts and Privacy JOINs | 0.115 | 0.101 | 0.107 | 0.108 | Seq Scan on companies | Seq Scan on employment_history | Seq Scan on profiles | Seq Scan on university_memberships | Seq Scan on connections |
| Q41 | READ | Company Profile by ID | 0.019 | 0.019 | 0.018 | 0.019 | Index Scan using companies_pkey on companies |
| Q42 | READ | List Alumni Employed at Company with JOINs on Employment, Users, Profiles, Memberships, and Career Preferences | 0.179 | 0.156 | 0.134 | 0.156 | Index Scan using companies_pkey on companies | Seq Scan on users | Seq Scan on profiles | Index Only Scan using connections_pkey on connections | Index Scan using career_preferences_pkey on career_preferences | Index Scan using employment_company_idx on employment_history | Index Scan using university_memberships_pkey on university_memberships | Seq Scan on user_skills | Index Scan using skills_pkey on skills |
| Q43 | READ | Check Duplicate Existing Company Name | 0.016 | 0.013 | 0.013 | 0.014 | Index Scan using companies_normalized_name_key on companies |
| Q44 | READ | Check Pending Company Suggestion Duplicate | 0.014 | 0.013 | 0.015 | 0.014 | Index Scan using company_suggestion_pending_name_uq on company_suggestions |
| Q45 | WRITE | Create New Company Suggestion for Admin Review | 0.421 | 0.486 | 0.401 | 0.436 | — |
| Q46 | READ | Verify Connection Recipient Eligibility with JOIN | 0.028 | 0.028 | 0.034 | 0.030 | Index Scan using users_pkey on users | Index Scan using university_memberships_pkey on university_memberships |
| Q47 | READ | Check Existing Accepted Connection | 0.015 | 0.013 | 0.017 | 0.015 | Index Only Scan using connections_pkey on connections |
| Q48 | WRITE | Send Connection Request | 0.410 | 0.542 | 0.430 | 0.461 | — |
| Q49 | READ | View Connection Requests with JOINs on Sender and Recipient | 0.047 | 0.052 | 0.044 | 0.048 | Seq Scan on users | Seq Scan on connection_requests |
| Q50 | READ | Lock Connection Request for Status Update | 0.045 | 0.026 | 0.027 | 0.033 | Index Scan using connection_requests_pkey on connection_requests |
| Q51 | WRITE | Update Connection Request Status | 0.099 | 0.105 | 0.097 | 0.100 | Index Scan using connection_requests_pkey on connection_requests |
| Q52 | WRITE | Establish Bi-directional Connection on Accept | 0.094 | 0.076 | 0.076 | 0.082 | Index Scan using connection_requests_pkey on connection_requests |
| Q53 | READ | List Member Connections with JOINs across Connections, Users, Profiles, Memberships, Employment, and Companies | 0.204 | 0.102 | 0.087 | 0.131 | Seq Scan on profiles | Seq Scan on connections | Index Scan using users_pkey on users | Index Scan using university_memberships_pkey on university_memberships | Bitmap Heap Scan on employment_history | Bitmap Index Scan on employment_current_company_uq | Index Scan using companies_pkey on companies |
| Q54 | READ | Verify Alumnus Mentorship Eligibility with multi-table JOINs | 0.033 | 0.032 | 0.034 | 0.033 | Index Scan using university_memberships_pkey on university_memberships | Index Scan using career_preferences_pkey on career_preferences | Index Scan using users_pkey on users |
| Q55 | READ | Verify Mentorship Requester Student Status | 0.017 | 0.026 | 0.017 | 0.020 | Index Scan using university_memberships_pkey on university_memberships |
| Q56 | WRITE | Create Mentorship Request | 0.413 | 0.404 | 0.834 | 0.550 | — |
| Q57 | READ | View Mentorship Requests with JOINs on Student and Alumnus | 0.056 | 0.047 | 0.076 | 0.060 | Seq Scan on users | Seq Scan on mentorship_requests |
| Q58 | READ | Lock Mentorship Request for State Transition | 0.029 | 0.028 | 0.029 | 0.029 | Index Scan using mentorship_requests_pkey on mentorship_requests |
| Q59 | WRITE | Update Mentorship Request Status | 0.124 | 0.151 | 0.124 | 0.133 | Index Scan using mentorship_requests_pkey on mentorship_requests |
| Q60 | READ | Authorization Check for Career Request Access with Admin JOIN | 0.041 | 0.038 | 0.035 | 0.038 | Index Scan using career_requests_pkey on career_requests | Index Scan using roles_name_key on roles | Index Only Scan using user_roles_pkey on user_roles |
| Q61 | READ | Verify Alumnus Availability for Career Request with JOINs | 0.041 | 0.033 | 0.042 | 0.039 | Index Scan using university_memberships_pkey on university_memberships | Index Scan using career_preferences_pkey on career_preferences | Index Scan using users_pkey on users |
| Q62 | READ | Verify Requester is a Student | 0.017 | 0.018 | 0.018 | 0.018 | Index Scan using university_memberships_pkey on university_memberships |
| Q63 | WRITE | Create Career Assistance Request | 0.554 | 0.494 | 0.526 | 0.525 | — |
| Q64 | WRITE | Insert Initial Conversation Message for Career Request | 0.646 | 0.519 | 0.788 | 0.651 | — |
| Q65 | READ | Get Resume Path for Download | 0.017 | 0.018 | 0.018 | 0.018 | Index Scan using career_requests_pkey on career_requests |
| Q66 | READ | List Member Career Requests with JOINs on Requester and Recipient | 0.051 | 0.068 | 0.052 | 0.057 | Seq Scan on users | Seq Scan on career_requests |
| Q67 | READ | Get Single Career Request Detail with JOINs on Users | 0.029 | 0.030 | 0.030 | 0.030 | Index Scan using career_requests_pkey on career_requests | Index Scan using users_pkey on users |
| Q68 | READ | Get Career Request Thread Messages with JOIN on Users | 0.051 | 0.043 | 0.063 | 0.052 | Seq Scan on users | Bitmap Heap Scan on career_request_messages | Bitmap Index Scan on career_messages_request_idx |
| Q69 | READ | Lock Career Request for Status Transition | 0.026 | 0.037 | 0.028 | 0.030 | Index Scan using career_requests_pkey on career_requests |
| Q70 | WRITE | Update Career Request Status | 0.129 | 0.133 | 0.158 | 0.140 | Index Scan using career_requests_pkey on career_requests |
| Q71 | READ | Fetch Career Request State Before Message Reply | 0.024 | 0.016 | 0.021 | 0.020 | Index Scan using career_requests_pkey on career_requests |
| Q72 | WRITE | Append Message to Career Request Thread | 0.522 | 0.504 | 0.493 | 0.506 | — |
| Q73 | WRITE | Touch Career Request Updated Timestamp | 0.143 | 0.139 | 0.128 | 0.137 | Index Scan using career_requests_pkey on career_requests |
| Q74 | READ | Browse and Filter Published Opportunities with JOINs on Users, Companies, and Saved Status | 0.064 | 0.052 | 0.073 | 0.063 | Index Scan using opportunities_search_idx on opportunities | Index Scan using users_pkey on users | Index Scan using companies_pkey on companies | Index Only Scan using saved_opportunities_pkey on saved_opportunities |
| Q75 | READ | Opportunity Detail by ID with JOINs on Users, Companies, and Saved Status | 0.047 | 0.044 | 0.058 | 0.050 | Index Scan using opportunities_pkey on opportunities | Index Scan using users_pkey on users | Index Scan using companies_pkey on companies | Index Only Scan using saved_opportunities_pkey on saved_opportunities |
| Q76 | READ | Verify Publisher Eligibility for Posting Opportunity | 0.017 | 0.020 | 0.016 | 0.018 | Index Scan using university_memberships_pkey on university_memberships |
| Q77 | READ | Verify Company is Approved for Opportunity | 0.018 | 0.017 | 0.022 | 0.019 | Index Scan using companies_pkey on companies |
| Q78 | WRITE | Post Opportunity | 0.450 | 0.443 | 0.521 | 0.471 | — |
| Q79 | WRITE | Update Opportunity with Authorization Role JOIN Check | 0.147 | 0.133 | 0.120 | 0.133 | Index Scan using roles_name_key on roles | Index Only Scan using user_roles_pkey on user_roles | Index Scan using opportunities_pkey on opportunities |
| Q80 | WRITE | Soft Delete Opportunity | 0.123 | 0.175 | 0.112 | 0.137 | Index Scan using roles_name_key on roles | Index Only Scan using user_roles_pkey on user_roles | Index Scan using opportunities_pkey on opportunities |
| Q81 | WRITE | Bookmark / Save Opportunity | 0.055 | 0.045 | 0.049 | 0.050 | Index Scan using opportunities_search_idx on opportunities |
| Q82 | READ | Check Existing Bookmark Status | 0.021 | 0.021 | 0.020 | 0.021 | Index Only Scan using saved_opportunities_pkey on saved_opportunities |
| Q83 | WRITE | Unbookmark Opportunity | 0.062 | 0.081 | 0.058 | 0.067 | Index Scan using saved_opportunities_pkey on saved_opportunities |
| Q84 | WRITE | Create Notification | 0.463 | 0.375 | 0.412 | 0.417 | — |
| Q85 | READ | List User Notifications | 0.028 | 0.028 | 0.024 | 0.027 | Bitmap Heap Scan on notifications | Bitmap Index Scan on notifications_inbox_idx |
| Q86 | WRITE | Mark All Notifications Read | 0.054 | 0.065 | 0.063 | 0.061 | Bitmap Heap Scan on notifications | Bitmap Index Scan on notifications_inbox_idx |
| Q87 | WRITE | Mark Single Notification Read | 0.092 | 0.087 | 0.083 | 0.087 | Index Scan using notifications_pkey on notifications |
| Q88 | READ | Admin Dashboard Aggregate Metrics | 0.086 | 0.095 | 0.091 | 0.091 | Seq Scan on users | Seq Scan on university_memberships | Bitmap Heap Scan on verification_requests | Bitmap Index Scan on verification_pending_user_uq | Seq Scan on companies | Seq Scan on career_requests | Seq Scan on mentorship_requests | Index Only Scan using opportunities_search_idx on opportunities |
| Q89 | READ | Admin Monitor Career Requests with JOINs on Requester and Recipient | 0.054 | 0.049 | 0.050 | 0.051 | Seq Scan on career_requests | Seq Scan on users |
| Q90 | READ | Admin Search Users with LEFT JOIN on University Memberships | 0.047 | 0.056 | 0.044 | 0.049 | Seq Scan on users | Seq Scan on university_memberships |
| Q91 | READ | Lock Membership Row for Admin Transition | 0.026 | 0.027 | 0.030 | 0.028 | Index Scan using university_memberships_pkey on university_memberships |
| Q92 | WRITE | Admin Update Membership (Student -> Alumni / Year Change) | 0.119 | 0.118 | 0.145 | 0.127 | Index Scan using university_memberships_pkey on university_memberships |
| Q93 | WRITE | Append Audit Log for Membership Change | 0.371 | 0.572 | 0.327 | 0.423 | — |
| Q94 | WRITE | Admin Update User Account Status (Active/Suspended) | 0.141 | 0.142 | 0.134 | 0.139 | Index Scan using users_pkey on users |
| Q95 | WRITE | Append Audit Log for Account Status Change | 0.329 | 0.425 | 0.436 | 0.397 | — |
| Q96 | READ | List Pending Affiliation Verifications with JOINs on Users and Memberships | 0.061 | 0.060 | 0.058 | 0.060 | Seq Scan on users | Bitmap Heap Scan on verification_requests | Bitmap Index Scan on verification_pending_user_uq | Index Scan using university_memberships_pkey on university_memberships |
| Q97 | READ | Lock Pending Verification for Review | 0.033 | 0.028 | 0.030 | 0.030 | Index Scan using verification_requests_pkey on verification_requests |
| Q98 | WRITE | Admin Update Verification Request Status | 0.469 | 0.313 | 0.307 | 0.363 | Index Scan using verification_requests_pkey on verification_requests |
| Q99 | WRITE | Admin Update University Membership Verification Status | 0.296 | 0.347 | 0.335 | 0.326 | Index Scan using university_memberships_pkey on university_memberships |
| Q100 | WRITE | Append Audit Log for Verification Review | 0.360 | 0.376 | 0.329 | 0.355 | — |
| Q101 | READ | List Pending Company Suggestions with JOIN on Users | 0.034 | 0.030 | 0.031 | 0.032 | Index Scan using company_suggestions_status_idx on company_suggestions | Index Scan using users_pkey on users |
| Q102 | READ | Lock Pending Company Suggestion for Review | 0.042 | 0.029 | 0.030 | 0.034 | Index Scan using company_suggestion_pending_name_uq on company_suggestions |
| Q103 | WRITE | Admin Approve & Insert Company from Suggestion | 0.160 | 0.166 | 0.155 | 0.160 | — |
| Q104 | WRITE | Admin Update Company Suggestion Status | 0.302 | 0.371 | 0.254 | 0.309 | Index Scan using company_suggestions_pkey on company_suggestions |
| Q105 | WRITE | Append Audit Log for Company Suggestion Review | 0.332 | 0.401 | 0.389 | 0.374 | — |
| Q106 | READ | Admin List All Companies | 0.041 | 0.026 | 0.036 | 0.034 | Seq Scan on companies |
| Q107 | WRITE | Admin Update Company Profile | 0.139 | 0.127 | 0.124 | 0.130 | Index Scan using companies_pkey on companies |
| Q108 | WRITE | Append Audit Log for Company Update | 0.344 | 0.516 | 0.323 | 0.394 | — |
| Q109 | READ | Admin List Opportunities with JOINs on Users and Companies | 0.041 | 0.039 | 0.039 | 0.040 | Index Scan using opportunities_search_idx on opportunities | Index Scan using users_pkey on users | Index Scan using companies_pkey on companies |
| Q110 | WRITE | Admin Moderate Opportunity Status | 0.122 | 0.129 | 0.149 | 0.133 | Index Scan using opportunities_pkey on opportunities |
| Q111 | WRITE | Append Audit Log for Opportunity Moderation | 0.362 | 0.362 | 0.332 | 0.352 | — |
| Q112 | READ | Check Admin Exists with Role JOIN | 0.034 | 0.036 | 0.032 | 0.034 | Seq Scan on user_roles | Index Scan using roles_name_key on roles |
| Q113 | WRITE | Create Bootstrap Admin User Account | 0.163 | 0.150 | 0.135 | 0.149 | — |
| Q114 | WRITE | Initialize Admin User Profile | 0.265 | 0.280 | 0.239 | 0.261 | — |
| Q115 | WRITE | Grant Admin Role via Subquery Lookup | 0.181 | 0.299 | 0.199 | 0.226 | Index Scan using roles_name_key on roles |

| **Total** | | **All 115 Queries Sum** | **16.828** | **16.918** | **16.968** | **16.905** | |

---

## 3. Plan & Scan Node Observations

1. **Primary & Unique Key Index Scans:**
   - Queries accessing specific rows via UUID (`users.id`, `companies.id`, `career_requests.id`, `mentorship_requests.id`) utilize high-efficiency B-tree `Index Scan` nodes (e.g., `users_pkey`, `companies_pkey`).
   - Lookups on normalized unique keys (`users_email_lower_uq`, `company_suggestion_pending_name_uq`) execute in sub-millisecond time (< 0.05 ms).

2. **Multi-Table JOIN Efficiency:**
   - Complex aggregate queries (e.g. `Q19` profile aggregation, `Q37` directory search, `Q40` company directory count) combine `Nested Loop` and `Hash Join` plans with index-driven inner scans.
   - The directory filter (`Q37`) effectively evaluates composite predicates and sorts using the `users.full_name` index condition.

3. **Transactional Write Safety:**
   - All `INSERT`, `UPDATE`, and `DELETE` operations execute inside `BEGIN ... ROLLBACK` blocks, proving foreign key consistency and unique index validation without corrupting benchmark repeatability.

---

## 4. Query Plans Index

Individual 3-run `EXPLAIN (ANALYZE, BUFFERS)` execution plans are organized under [`dbms/plans/`](plans/):

| Range | Domain Section | Plans |
|---|---|---|
| `Q01` – `Q04` | System Health & Middleware Authorization | [Plans](plans/) (`Q01.txt` – `Q04.txt`) |
| `Q05` – `Q18` | Authentication & Registration Lifecycle | [Plans](plans/) (`Q05.txt` – `Q18.txt`) |
| `Q19` – `Q36` | Profiles, Skills, and Employment | [Plans](plans/) (`Q19.txt` – `Q36.txt`) |
| `Q37` – `Q39` | Alumni Directory & Search | [Plans](plans/) (`Q37.txt` – `Q39.txt`) |
| `Q40` – `Q45` | Companies & Employer Directory | [Plans](plans/) (`Q40.txt` – `Q45.txt`) |
| `Q46` – `Q53` | Connections & Networking | [Plans](plans/) (`Q46.txt` – `Q53.txt`) |
| `Q54` – `Q59` | Mentorship | [Plans](plans/) (`Q54.txt` – `Q59.txt`) |
| `Q60` – `Q73` | Career Assistance, Guidance & Referrals | [Plans](plans/) (`Q60.txt` – `Q73.txt`) |
| `Q74` – `Q83` | Opportunities & Job Board | [Plans](plans/) (`Q74.txt` – `Q83.txt`) |
| `Q84` – `Q87` | Notifications | [Plans](plans/) (`Q84.txt` – `Q87.txt`) |
| `Q88` – `Q111` | Admin Console, Verifications, and Audit Logs | [Plans](plans/) (`Q88.txt` – `Q111.txt`) |
| `Q112` – `Q115` | System Setup & Bootstrap Scripts | [Plans](plans/) (`Q112.txt` – `Q115.txt`) |
