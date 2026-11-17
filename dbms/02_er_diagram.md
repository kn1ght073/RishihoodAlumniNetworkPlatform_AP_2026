# Entity relationship model

This map follows the foreign keys declared in [`database/schema.sql`](../database/schema.sql). A one-to-many relationship means one parent row can be referenced by many child rows; one-to-one tables use the parent ID as their primary key.

## Accounts and membership

| Parent | Child | Relationship |
| --- | --- | --- |
| `users` | `user_roles` | One user can have many role assignments. |
| `roles` | `user_roles` | One role can be assigned to many users. Together, `user_roles(user_id, role_id)` is the many-to-many join. |
| `users` | `university_memberships` | Zero or one membership per user; membership is keyed by `user_id`. |
| `users` | `university_memberships.verified_by` | A reviewer may verify many memberships; reviewer is optional. |
| `users` | `profiles` | Zero or one profile per user; profile is keyed by `user_id`. |
| `users` | `career_preferences` | Zero or one preference row per user; keyed by `user_id`. |
| `users` | `email_verification_tokens` | One user can have multiple verification tokens. |
| `users` | `user_sessions` | No foreign-key relationship is declared; sessions are stored by session ID. |

## Skills, companies, and work history

| Parent | Child | Relationship |
| --- | --- | --- |
| `users` | `user_skills` | One user can list many skills. |
| `skills` | `user_skills` | One skill can belong to many users. Together, `user_skills(user_id, skill_id)` is the many-to-many join. |
| `users` | `employment_history` | One user can have many employment records. |
| `companies` | `employment_history` | One company can appear in many employment records. |
| `users` | `company_suggestions.submitted_by` | One user can submit many company suggestions. |
| `users` | `company_suggestions.reviewed_by` | A reviewer may review many suggestions; reviewer is optional. |

## Connections, guidance, and mentorship

| Parent | Child | Relationship |
| --- | --- | --- |
| `users` | `connection_requests.sender_id` | One user can send many connection requests. |
| `users` | `connection_requests.recipient_id` | One user can receive many connection requests. |
| `users` | `connections.member_low_id` / `member_high_id` | Each connection joins two users. The ordered pair is the composite primary key; a check constraint requires `member_low_id < member_high_id`. |
| `users` | `career_requests.requester_id` / `recipient_id` | Users can make and receive career requests. |
| `companies` | `career_requests` | A request may refer to a company; this reference is optional. |
| `career_requests` | `career_request_messages` | One request can contain many messages. |
| `users` | `career_request_messages.sender_id` | One user can send many request messages. |
| `users` | `mentorship_requests.student_id` / `alumnus_id` | Users can appear as the student or alumnus in many mentorship requests. |

## Opportunities, notifications, and administration

| Parent | Child | Relationship |
| --- | --- | --- |
| `users` | `opportunities.publisher_id` | One user can publish many opportunities. |
| `companies` | `opportunities` | An opportunity may refer to a company; this reference is optional. |
| `users` | `saved_opportunities` | One user can save many opportunities. |
| `opportunities` | `saved_opportunities` | One opportunity can be saved by many users. Together, `(user_id, opportunity_id)` is the many-to-many join. |
| `users` | `notifications` | One user can receive many notifications. |
| `users` | `verification_requests.user_id` | One user can submit verification requests. |
| `users` | `verification_requests.reviewed_by` | A reviewer may review many requests; reviewer is optional. |
| `users` | `audit_logs.actor_id` | One user can be recorded as the actor in many audit rows; the actor is optional. |

## References without foreign keys

`notifications.reference_id` and `audit_logs.target_id` are UUIDs without foreign-key constraints, so they can refer to records from different tables. `user_sessions` has no `user_id` column or user foreign key. These are deliberately not shown as enforced entity relationships.

## Schema coverage

The schema contains 23 tables. The relationship map above covers every declared foreign key, including both role-bearing sides of requests and optional reviewer references. Column definitions, constraints, indexes, and delete behavior remain authoritative in [`database/schema.sql`](../database/schema.sql).
