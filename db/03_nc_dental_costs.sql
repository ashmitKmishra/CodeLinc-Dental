-- nc_dental_costs: 30 common dental services in North Carolina with typical 2026 self-pay costs (USD).
--
-- basis = 'NC observed'  a published North Carolina figure.
-- basis = 'NC estimate'  a 2026 national figure scaled to NC (NC runs about 6% below the national average),
--                        cross-checked against published Charlotte and Burlington NC practice price guides.
-- These are estimates. Actual fees vary by dentist, city and insurance.
--
-- Safe to run more than once: it rebuilds the table from scratch.

BEGIN;

DROP TABLE IF EXISTS nc_dental_costs;

CREATE TABLE nc_dental_costs (
  id          SMALLINT     PRIMARY KEY,
  cdt_code    TEXT         NOT NULL UNIQUE CHECK (cdt_code ~ '^D[0-9]{4}$'),
  service     TEXT         NOT NULL,
  category    TEXT         NOT NULL CHECK (category IN ('preventive','diagnostic','basic','major','orthodontic','cosmetic')),
  cost_low    NUMERIC(8,2) NOT NULL CHECK (cost_low > 0),
  cost_avg    NUMERIC(8,2) NOT NULL,
  cost_high   NUMERIC(8,2) NOT NULL,
  unit        TEXT         NOT NULL,
  basis       TEXT         NOT NULL CHECK (basis IN ('NC observed','NC estimate')),
  source      TEXT         NOT NULL,
  updated_on  DATE         NOT NULL DEFAULT DATE '2026-10-03',
  CHECK (cost_low <= cost_avg AND cost_avg <= cost_high)
);

INSERT INTO nc_dental_costs (id, cdt_code, service, category, cost_low, cost_avg, cost_high, unit, basis, source) VALUES
 ( 1, 'D0120', 'Periodic oral exam',                                 'diagnostic',    45,   75,  120, 'per visit',     'NC estimate', 'National 2026 estimate scaled to NC'),
 ( 2, 'D0150', 'Comprehensive exam (new patient)',                   'diagnostic',    70,  110,  180, 'per visit',     'NC estimate', 'National 2026 estimate scaled to NC; Burlington NC guide $100-$250'),
 ( 3, 'D0140', 'Limited or emergency exam',                          'diagnostic',    55,   90,  150, 'per visit',     'NC estimate', 'National 2026 estimate scaled to NC'),
 ( 4, 'D0274', 'Bitewing X-rays (4 images)',                         'diagnostic',    50,   80,  120, 'per set',       'NC estimate', 'National 2026 estimate scaled to NC'),
 ( 5, 'D0210', 'Full-mouth X-rays',                                  'diagnostic',   100,  150,  230, 'per set',       'NC estimate', 'National 2026 estimate scaled to NC'),
 ( 6, 'D0330', 'Panoramic X-ray',                                    'diagnostic',    90,  135,  200, 'per image',     'NC estimate', 'National 2026 estimate scaled to NC'),
 ( 7, 'D1110', 'Adult cleaning',                                     'preventive',    80,  120,  180, 'per visit',     'NC estimate', 'National 2026 estimate scaled to NC; Burlington NC guide $100-$200'),
 ( 8, 'D1120', 'Child cleaning',                                     'preventive',    55,   85,  130, 'per visit',     'NC estimate', 'National 2026 estimate scaled to NC'),
 ( 9, 'D1208', 'Fluoride treatment',                                 'preventive',    25,   40,   65, 'per visit',     'NC estimate', 'National 2026 estimate scaled to NC'),
 (10, 'D1351', 'Sealant',                                            'preventive',    35,   55,   85, 'per tooth',     'NC estimate', 'National 2026 estimate scaled to NC'),
 (11, 'D4346', 'Gingivitis scaling',                                 'preventive',    90,  140,  210, 'per visit',     'NC estimate', 'National 2026 estimate scaled to NC'),
 (12, 'D4910', 'Periodontal maintenance cleaning',                   'major',        110,  160,  230, 'per visit',     'NC estimate', 'National 2026 estimate scaled to NC'),
 (13, 'D4341', 'Deep cleaning (scaling and root planing)',           'major',        160,  228,  330, 'per quadrant',  'NC estimate', 'National 2026 average $242 scaled to NC'),
 (14, 'D2140', 'Silver (amalgam) filling, 1 surface',                'basic',         90,  140,  210, 'per tooth',     'NC estimate', 'National 2026 estimate scaled to NC'),
 (15, 'D2391', 'Tooth-colored filling, 1 surface, back tooth',       'basic',        120,  210,  400, 'per tooth',     'NC estimate', 'National 2026 average $226 scaled to NC; Burlington NC guide $150-$400'),
 (16, 'D2392', 'Tooth-colored filling, 2 surfaces, back tooth',      'basic',        160,  255,  420, 'per tooth',     'NC estimate', 'National 2026 estimate scaled to NC'),
 (17, 'D2330', 'Tooth-colored filling, 1 surface, front tooth',      'basic',        100,  170,  280, 'per tooth',     'NC estimate', 'National 2026 estimate scaled to NC'),
 (18, 'D7140', 'Simple extraction',                                  'basic',         75,  185,  320, 'per tooth',     'NC estimate', 'National 2026 estimate scaled to NC'),
 (19, 'D2740', 'Porcelain/ceramic crown',                            'major',        985, 1290, 2190, 'per tooth',     'NC estimate', 'CareCredit/ASQ360 national average $1,369 scaled to NC; Burlington NC guide $1,100-$1,700'),
 (20, 'D2950', 'Core buildup (before a crown)',                      'major',        190,  290,  420, 'per tooth',     'NC estimate', 'National 2026 range $200-$450 scaled to NC'),
 (21, 'D3310', 'Root canal, front tooth',                            'major',        600,  850, 1200, 'per tooth',     'NC estimate', 'National 2026 estimate scaled to NC'),
 (22, 'D3320', 'Root canal, premolar',                               'major',        700,  980, 1350, 'per tooth',     'NC estimate', 'National 2026 estimate scaled to NC'),
 (23, 'D3330', 'Root canal, molar',                                  'major',        850, 1150, 1550, 'per tooth',     'NC estimate', 'National 2026 estimate scaled to NC; Burlington NC guide $700-$1,600'),
 (24, 'D7210', 'Surgical extraction',                                'major',        180,  320,  550, 'per tooth',     'NC estimate', 'National 2026 estimate scaled to NC'),
 (25, 'D7240', 'Wisdom tooth removal, fully bony impacted',          'major',        300,  520,  850, 'per tooth',     'NC estimate', 'National 2026 estimate scaled to NC'),
 (26, 'D6010', 'Single implant, complete (post, abutment and crown)','major',       3500, 4242, 5400, 'per tooth',     'NC observed', 'Real Dental Costs observed NC dataset, DOI 10.5281/zenodo.20531728'),
 (27, 'D5110', 'Complete denture, upper',                            'major',        650,  920, 1700, 'per arch',      'NC estimate', 'CareCredit/ASQ360 full set $1,953 national, per arch, scaled to NC'),
 (28, 'D2962', 'Porcelain veneer',                                   'cosmetic',     470, 1435, 2710, 'per tooth',     'NC observed', 'CareCredit/ASQ360 Market Research, NC figure'),
 (29, 'D9972', 'In-office teeth whitening',                          'cosmetic',     280,  610,  940, 'per treatment', 'NC estimate', 'National 2026 figure $650 scaled to NC'),
 (30, 'D8090', 'Braces, comprehensive (adult)',                      'orthodontic', 2350, 6716, 9400, 'per full case', 'NC observed', 'CareCredit/ASQ360 Market Research, NC figure');

-- Read-only login used by the public API. It signs in with IAM, so it has no password.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'api_reader') THEN
    CREATE ROLE api_reader WITH LOGIN;
  END IF;
END
$$;
GRANT rds_iam TO api_reader;
GRANT CONNECT ON DATABASE postgres TO api_reader;
GRANT USAGE ON SCHEMA public TO api_reader;
GRANT SELECT ON nc_dental_costs TO api_reader;

COMMIT;
