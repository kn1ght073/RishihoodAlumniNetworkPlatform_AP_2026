-- Safe reference data only. Create the first administrator with `npm run create-admin`.
INSERT INTO roles(name) VALUES ('MEMBER'), ('ADMIN') ON CONFLICT (name) DO NOTHING;
