# PostgreSQL setup

The app uses PostgreSQL directly through `pg`. Keep the database separate from the Express server; the backend never creates, drops, or resets the database when it starts.

## Create a local database

Install PostgreSQL 14 or newer and start its local service. In a terminal, create the database and apply the schema and seed data:

```sh
createdb rishihood_alumni
psql -d rishihood_alumni -f database/schema.sql
psql -d rishihood_alumni -f database/seeds/seed.sql
```

If your local PostgreSQL user requires a password, use `createdb -U your_user rishihood_alumni` and the equivalent `psql -U your_user ...` commands.

## Configure the application

Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL` to your local PostgreSQL connection string. Never commit that file.

## Migrations

The schema file is the baseline for a brand-new database. Put later changes in numbered files under `database/migrations/` and apply them explicitly:

```sh
psql -d rishihood_alumni -f database/migrations/001_your_change.sql
```

Do not re-run the baseline schema on an existing database. It is not a migration and the application never applies it automatically.

## Back up and restore

Create a compressed logical backup:

```sh
pg_dump -Fc -d rishihood_alumni -f database/backup/rishihood_alumni.dump
```

Restore to an already-created, empty target database:

```sh
createdb rishihood_alumni_restore
pg_restore -d rishihood_alumni_restore database/backup/rishihood_alumni.dump
```

Do not commit real backups to Git. The `backup/` folder is for local artifacts and is ignored.
