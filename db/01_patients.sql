-- patients: 10 fictional employees with their dental insurer, employer and family members.
-- Fictional data; phone numbers use the reserved 555-01xx range.
-- Safe to run more than once: it rebuilds the table from scratch.

BEGIN;

DROP TABLE IF EXISTS patients;

CREATE TABLE patients (
  id               SMALLINT PRIMARY KEY,
  full_name        TEXT     NOT NULL,
  phone            TEXT     NOT NULL,
  employer         TEXT     NOT NULL,
  insurance        TEXT     NOT NULL CHECK (insurance IN ('Lincoln Financial','Delta Dental','MetLife','Cigna','Aetna')),
  has_family       BOOLEAN  NOT NULL,
  family_members   TEXT     NOT NULL  -- e.g. 'spouse, daughter'; 'none' when has_family is false
);

INSERT INTO patients (id, full_name, phone, employer, insurance, has_family, family_members) VALUES
 ( 1, 'Maya Patel',       '+1-919-555-0101', 'Duke Energy',         'Lincoln Financial', true,  'spouse, daughter'),
 ( 2, 'James Carter',     '+1-704-555-0102', 'Bank of America',     'Delta Dental',      true,  'spouse, son, son'),
 ( 3, 'Linh Nguyen',      '+1-336-555-0103', 'Truist',              'Lincoln Financial', false, 'none'),
 ( 4, 'Marcus Johnson',   '+1-980-555-0104', 'Lowe''s',             'MetLife',           true,  'daughter'),
 ( 5, 'Sofia Ramirez',    '+1-919-555-0105', 'SAS Institute',       'Cigna',             true,  'spouse'),
 ( 6, 'Ethan Brooks',     '+1-828-555-0106', 'Biltmore Estate',     'Aetna',             false, 'none'),
 ( 7, 'Priya Desai',      '+1-919-555-0107', 'Red Hat',             'Lincoln Financial', true,  'spouse, son, daughter'),
 ( 8, 'Daniel Kim',       '+1-704-555-0108', 'Atrium Health',       'Delta Dental',      false, 'none'),
 ( 9, 'Hannah Williams',  '+1-910-555-0109', 'Cape Fear Valley',    'Cigna',             true,  'son'),
 (10, 'Omar Hassan',      '+1-336-555-0110', 'Reynolds American',   'Aetna',             true,  'spouse, daughter');

COMMIT;
