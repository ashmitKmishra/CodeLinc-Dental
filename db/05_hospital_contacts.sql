-- hospital_contacts: where a patient can confirm a price with each hospital in nc_hospitals.
-- Collected 2026-10-04 from each hospital system's own website (price-estimate, billing and contact pages). Hospitals rarely publish an
-- email for price questions, so `email` is set only where the hospital itself lists one for billing or patient-financial questions
-- (Atrium: billing; Novant: billing contact centre). Everywhere else patients are pointed to the phone number and `info_url`.
-- Never fill `email` with a guess: the API tells patients to write to exactly what is stored here.
-- Safe to run more than once: it upserts and keeps the table.

BEGIN;

CREATE TABLE IF NOT EXISTS hospital_contacts (
  name     TEXT PRIMARY KEY,
  email    TEXT CHECK (email IS NULL OR email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone    TEXT,   -- price-estimate or patient-financial line where published, otherwise the main number
  info_url TEXT NOT NULL
);

INSERT INTO hospital_contacts (name, email, phone, info_url) VALUES
 ('Duke University Hospital', NULL, '919-620-3264', 'https://www.dukehealth.org/paying-for-care/what-duke-charges-services'),
 ('Duke Raleigh Hospital', NULL, '919-620-3264', 'https://www.dukehealth.org/paying-for-care/what-duke-charges-services'),
 ('Duke Regional Hospital', NULL, '919-620-3264', 'https://www.dukehealth.org/paying-for-care/what-duke-charges-services'),
 ('UNC Medical Center', NULL, '984-974-2222', 'https://www.unchealth.org/records-insurance/standard-charges'),
 ('UNC Rex Hospital', NULL, '984-974-2222', 'https://www.unchealth.org/records-insurance/standard-charges'),
 ('UNC Health Johnston', NULL, '984-974-2222', 'https://www.unchealth.org/records-insurance/standard-charges'),
 ('Margaret R. Pardee Memorial Hospital', NULL, '984-974-2222', 'https://www.unchealth.org/records-insurance/standard-charges'),
 ('Atrium Health Carolinas Medical Center', 'AHPA@AtriumHealth.org', '704-355-0900', 'https://atriumhealth.org/for-patients-visitors/financial-assistance/pricing'),
 ('Atrium Health Wake Forest Baptist', 'AHPA@AtriumHealth.org', '704-355-0900', 'https://atriumhealth.org/for-patients-visitors/financial-assistance/pricing'),
 ('Atrium Health Wake Forest Baptist High Point Medical Center', 'AHPA@AtriumHealth.org', '704-355-0900', 'https://atriumhealth.org/for-patients-visitors/financial-assistance/pricing'),
 ('Atrium Health Cabarrus', 'AHPA@AtriumHealth.org', '704-355-0900', 'https://atriumhealth.org/for-patients-visitors/financial-assistance/pricing'),
 ('Atrium Health Union', 'AHPA@AtriumHealth.org', '704-355-0900', 'https://atriumhealth.org/for-patients-visitors/financial-assistance/pricing'),
 ('Atrium Health Cleveland', 'AHPA@AtriumHealth.org', '704-355-0900', 'https://atriumhealth.org/for-patients-visitors/financial-assistance/pricing'),
 ('Atrium Health Lincoln', 'AHPA@AtriumHealth.org', '704-355-0900', 'https://atriumhealth.org/for-patients-visitors/financial-assistance/pricing'),
 ('Novant Health Forsyth Medical Center', 'NHCSCC@Contact.NovantHealth.org', '1-888-277-3901', 'https://www.novanthealth.org/for-patients/billing--insurance/price-transparency/'),
 ('Novant Health Presbyterian Medical Center', 'NHCSCC@Contact.NovantHealth.org', '1-888-277-3901', 'https://www.novanthealth.org/for-patients/billing--insurance/price-transparency/'),
 ('Novant Health Rowan Medical Center', 'NHCSCC@Contact.NovantHealth.org', '1-888-277-3901', 'https://www.novanthealth.org/for-patients/billing--insurance/price-transparency/'),
 ('New Hanover Regional Medical Center', 'NHCSCC@Contact.NovantHealth.org', '844-266-8268', 'https://www.nhrmc.org/patients/insurance-billing/pricing-information'),
 ('ECU Health Medical Center', NULL, '252-847-4472', 'https://www.ecuhealth.org/patients-and-families/your-bill/'),
 ('ECU Health Beaufort Hospital', NULL, '252-847-4472', 'https://www.ecuhealth.org/patients-and-families/your-bill/'),
 ('The Outer Banks Hospital', NULL, '800-788-4473', 'https://www.outerbankshealth.org/patients-visitors/'),
 ('Mission Hospital', NULL, '833-634-6306', 'https://www.missionhealth.org/patient-resources/patient-financial-resources/pricing-estimates-and-information'),
 ('WakeMed Raleigh Campus', NULL, '919-350-7808', 'https://www.wakemed.org/patients-and-visitors/billing-and-insurance/get-an-estimate'),
 ('Moses H. Cone Memorial Hospital', NULL, '336-832-8014', 'https://www.conehealth.com/patients-visitors/patient-financial-services/patient-estimates--charges/'),
 ('Cone Health Alamance Regional Medical Center', NULL, '336-832-8014', 'https://www.conehealth.com/patients-visitors/patient-financial-services/patient-estimates--charges/'),
 ('FirstHealth Moore Regional Hospital', NULL, '910-715-1000', 'https://www.firsthealth.org/contact-us/'),
 ('Cape Fear Valley Medical Center', NULL, '910-609-4000', 'https://www.capefearvalley.com/contact-us'),
 ('Frye Regional Medical Center', NULL, '855-246-6883', 'https://www.fryemedctr.com/understanding-your-healthcare-costs'),
 ('Catawba Valley Medical Center', NULL, '828-326-3393', 'https://www.catawbavalleyhealth.org/patients-visitors/billing-and-insurance/price-transparency/'),
 ('Onslow Memorial Hospital', NULL, '910-577-4703', 'https://www.onslow.org/billing-insurance')
ON CONFLICT (name) DO UPDATE SET email = EXCLUDED.email, phone = EXCLUDED.phone, info_url = EXCLUDED.info_url;

GRANT SELECT ON hospital_contacts TO api_app;

COMMIT;
