-- Migration 001: Fix graduation_year check constraints to allow past alumni and future students.
ALTER TABLE university_memberships DROP CONSTRAINT IF EXISTS university_memberships_graduation_year_check;
ALTER TABLE university_memberships ADD CONSTRAINT university_memberships_graduation_year_check CHECK (graduation_year BETWEEN 1950 AND 2200);
ALTER TABLE university_memberships DROP CONSTRAINT IF EXISTS university_memberships_expected_graduation_year_check;
ALTER TABLE university_memberships ADD CONSTRAINT university_memberships_expected_graduation_year_check CHECK (expected_graduation_year BETWEEN 1950 AND 2200);
