-- nc_hospitals: 30 North Carolina hospitals with placeholder network status per insurer.
-- Network status is randomly generated demo data, NOT accurate. Replace with real payer directory data.
-- Safe to run more than once: it rebuilds the table from scratch.

BEGIN;

DROP TABLE IF EXISTS nc_hospitals;

CREATE TABLE nc_hospitals (
  id        SMALLINT PRIMARY KEY,
  name      TEXT NOT NULL,
  city      TEXT NOT NULL,
  system    TEXT NOT NULL,
  lincoln_financial TEXT NOT NULL CHECK (lincoln_financial IN ('in-network','out-of-network')),
  delta_dental TEXT NOT NULL CHECK (delta_dental IN ('in-network','out-of-network')),
  metlife TEXT NOT NULL CHECK (metlife IN ('in-network','out-of-network')),
  cigna TEXT NOT NULL CHECK (cigna IN ('in-network','out-of-network')),
  aetna TEXT NOT NULL CHECK (aetna IN ('in-network','out-of-network'))
);

INSERT INTO nc_hospitals (id, name, city, system, lincoln_financial, delta_dental, metlife, cigna, aetna) VALUES
 ( 1, 'Duke University Hospital', 'Durham', 'Duke Health', 'in-network', 'in-network', 'out-of-network', 'in-network', 'out-of-network'),
 ( 2, 'UNC Medical Center', 'Chapel Hill', 'UNC Health', 'in-network', 'in-network', 'in-network', 'in-network', 'in-network'),
 ( 3, 'Atrium Health Carolinas Medical Center', 'Charlotte', 'Atrium Health', 'in-network', 'in-network', 'in-network', 'out-of-network', 'in-network'),
 ( 4, 'Atrium Health Wake Forest Baptist', 'Winston-Salem', 'Atrium Health', 'in-network', 'in-network', 'out-of-network', 'out-of-network', 'in-network'),
 ( 5, 'Novant Health Forsyth Medical Center', 'Winston-Salem', 'Novant Health', 'out-of-network', 'in-network', 'out-of-network', 'in-network', 'in-network'),
 ( 6, 'ECU Health Medical Center', 'Greenville', 'ECU Health', 'in-network', 'in-network', 'out-of-network', 'in-network', 'out-of-network'),
 ( 7, 'Mission Hospital', 'Asheville', 'HCA Healthcare', 'in-network', 'in-network', 'in-network', 'in-network', 'in-network'),
 ( 8, 'WakeMed Raleigh Campus', 'Raleigh', 'WakeMed', 'in-network', 'out-of-network', 'in-network', 'in-network', 'out-of-network'),
 ( 9, 'Duke Raleigh Hospital', 'Raleigh', 'Duke Health', 'in-network', 'in-network', 'out-of-network', 'out-of-network', 'in-network'),
 (10, 'Duke Regional Hospital', 'Durham', 'Duke Health', 'in-network', 'in-network', 'out-of-network', 'out-of-network', 'in-network'),
 (11, 'Novant Health Presbyterian Medical Center', 'Charlotte', 'Novant Health', 'out-of-network', 'in-network', 'in-network', 'out-of-network', 'in-network'),
 (12, 'Novant Health Rowan Medical Center', 'Salisbury', 'Novant Health', 'in-network', 'in-network', 'out-of-network', 'out-of-network', 'out-of-network'),
 (13, 'Moses H. Cone Memorial Hospital', 'Greensboro', 'Cone Health', 'out-of-network', 'in-network', 'out-of-network', 'out-of-network', 'out-of-network'),
 (14, 'Cone Health Alamance Regional Medical Center', 'Burlington', 'Cone Health', 'in-network', 'out-of-network', 'out-of-network', 'in-network', 'out-of-network'),
 (15, 'Atrium Health Cabarrus', 'Concord', 'Atrium Health', 'in-network', 'out-of-network', 'out-of-network', 'out-of-network', 'out-of-network'),
 (16, 'Atrium Health Union', 'Monroe', 'Atrium Health', 'in-network', 'in-network', 'out-of-network', 'in-network', 'in-network'),
 (17, 'Atrium Health Cleveland', 'Shelby', 'Atrium Health', 'in-network', 'in-network', 'in-network', 'out-of-network', 'in-network'),
 (18, 'Atrium Health Lincoln', 'Lincolnton', 'Atrium Health', 'in-network', 'in-network', 'out-of-network', 'in-network', 'in-network'),
 (19, 'FirstHealth Moore Regional Hospital', 'Pinehurst', 'FirstHealth', 'in-network', 'out-of-network', 'out-of-network', 'out-of-network', 'in-network'),
 (20, 'Cape Fear Valley Medical Center', 'Fayetteville', 'Cape Fear Valley Health', 'in-network', 'in-network', 'out-of-network', 'out-of-network', 'in-network'),
 (21, 'New Hanover Regional Medical Center', 'Wilmington', 'NHRMC', 'in-network', 'in-network', 'in-network', 'in-network', 'out-of-network'),
 (22, 'UNC Rex Hospital', 'Raleigh', 'UNC Health', 'in-network', 'in-network', 'in-network', 'in-network', 'out-of-network'),
 (23, 'UNC Health Johnston', 'Smithfield', 'UNC Health', 'out-of-network', 'out-of-network', 'in-network', 'out-of-network', 'out-of-network'),
 (24, 'Frye Regional Medical Center', 'Hickory', 'Duke LifePoint', 'in-network', 'out-of-network', 'out-of-network', 'out-of-network', 'out-of-network'),
 (25, 'Catawba Valley Medical Center', 'Hickory', 'Frye/Catawba', 'in-network', 'in-network', 'in-network', 'out-of-network', 'in-network'),
 (26, 'Atrium Health Wake Forest Baptist High Point Medical Center', 'High Point', 'Atrium Health', 'in-network', 'in-network', 'in-network', 'in-network', 'in-network'),
 (27, 'Margaret R. Pardee Memorial Hospital', 'Hendersonville', 'UNC Health Pardee', 'in-network', 'in-network', 'in-network', 'in-network', 'in-network'),
 (28, 'ECU Health Beaufort Hospital', 'Washington', 'ECU Health', 'out-of-network', 'in-network', 'in-network', 'in-network', 'in-network'),
 (29, 'Onslow Memorial Hospital', 'Jacksonville', 'Onslow Memorial', 'in-network', 'in-network', 'out-of-network', 'out-of-network', 'in-network'),
 (30, 'The Outer Banks Hospital', 'Nags Head', 'Outer Banks Health', 'in-network', 'in-network', 'in-network', 'in-network', 'in-network');

COMMIT;
