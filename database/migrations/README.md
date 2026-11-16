# Database migrations

`../schema.sql` is the complete initial schema for a new database. Later changes belong in numbered SQL files here (for example `001_add_event_registration.sql`). Apply reviewed migrations manually with `psql`; the application does not run DDL or reset data on startup. Record each applied migration in the release notes for the environment.
