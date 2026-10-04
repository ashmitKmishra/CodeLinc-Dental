import type { CoverageClass, PlanSummary, Procedure } from './schemas';

/**
 * Common procedures, without prices. Prices come from the dentist's quote.
 * `defaultClass` is the usual class; a plan can reclass a code via `procedureClassOverrides`.
 */
export interface CatalogProcedure {
  code: string;
  name: string;
  plainName: string;
  description: string;
  defaultClass: CoverageClass;
  frequencyKey: string | null;
}

export const procedureCatalog: CatalogProcedure[] = [
  { code: 'D0120', name: 'Periodic oral evaluation', plainName: 'Checkup and exam', description: 'A routine exam of your teeth and gums.', defaultClass: 'preventive', frequencyKey: 'exam' },
  { code: 'D1110', name: 'Prophylaxis, adult', plainName: 'Cleaning (adult)', description: 'A routine cleaning to remove plaque and tartar.', defaultClass: 'preventive', frequencyKey: 'cleaning' },
  { code: 'D1120', name: 'Prophylaxis, child', plainName: 'Cleaning (child)', description: 'A routine cleaning for a child.', defaultClass: 'preventive', frequencyKey: 'cleaning' },
  { code: 'D0274', name: 'Bitewing X-rays (four)', plainName: 'Bitewing X-rays', description: 'X-rays that show between the back teeth.', defaultClass: 'preventive', frequencyKey: 'bitewings' },
  { code: 'D0210', name: 'Full-mouth X-rays', plainName: 'Full-mouth X-rays', description: 'A full set of X-rays of every tooth.', defaultClass: 'preventive', frequencyKey: 'full_mouth_xray' },
  { code: 'D1206', name: 'Topical fluoride', plainName: 'Fluoride treatment', description: 'Fluoride applied to strengthen teeth.', defaultClass: 'preventive', frequencyKey: 'fluoride' },
  { code: 'D1351', name: 'Sealant, per tooth', plainName: 'Sealant', description: 'A thin coating on a back tooth to prevent decay.', defaultClass: 'preventive', frequencyKey: 'sealant' },
  { code: 'D2391', name: 'Resin filling, one surface, back tooth', plainName: 'Filling (one surface)', description: 'A tooth-colored filling on one side of a back tooth.', defaultClass: 'basic', frequencyKey: null },
  { code: 'D2392', name: 'Resin filling, two surfaces, back tooth', plainName: 'Filling (two surfaces)', description: 'A tooth-colored filling covering two sides of a back tooth.', defaultClass: 'basic', frequencyKey: null },
  { code: 'D4341', name: 'Scaling and root planing, per quadrant', plainName: 'Deep cleaning (one quarter of the mouth)', description: 'A deep cleaning below the gumline to treat gum disease.', defaultClass: 'basic', frequencyKey: 'scaling' },
  { code: 'D3310', name: 'Root canal, front tooth', plainName: 'Root canal (front tooth)', description: 'Removing the nerve of a damaged front tooth and sealing it.', defaultClass: 'basic', frequencyKey: null },
  { code: 'D3330', name: 'Root canal, molar', plainName: 'Root canal (molar)', description: 'Removing the nerve of a damaged back tooth and sealing it.', defaultClass: 'basic', frequencyKey: null },
  { code: 'D7140', name: 'Simple extraction', plainName: 'Tooth extraction (simple)', description: 'Pulling a tooth that can be reached easily.', defaultClass: 'basic', frequencyKey: null },
  { code: 'D7240', name: 'Impacted tooth removal', plainName: 'Wisdom tooth removal (impacted)', description: 'Surgical removal of an impacted tooth.', defaultClass: 'basic', frequencyKey: null },
  { code: 'D2740', name: 'Crown, porcelain/ceramic', plainName: 'Crown (porcelain)', description: 'A cap that covers and protects a damaged tooth.', defaultClass: 'major', frequencyKey: 'crown' },
  { code: 'D6240', name: 'Bridge unit, porcelain', plainName: 'Bridge (per unit)', description: 'A fixed replacement for a missing tooth, per unit.', defaultClass: 'major', frequencyKey: 'bridge' },
  { code: 'D5110', name: 'Complete denture, upper', plainName: 'Full denture (upper)', description: 'A removable set of replacement teeth for the upper jaw.', defaultClass: 'major', frequencyKey: 'denture' },
  { code: 'D8080', name: 'Comprehensive orthodontic treatment', plainName: 'Braces (full treatment)', description: 'Orthodontic treatment with braces, for the full course.', defaultClass: 'ortho', frequencyKey: null },
];

export function resolveProcedures(plan: PlanSummary): Procedure[] {
  return procedureCatalog.map((p) => ({
    code: p.code,
    name: p.name,
    plainName: p.plainName,
    description: p.description,
    coverageClass: plan.procedureClassOverrides[p.code] ?? p.defaultClass,
    frequencyKey: p.frequencyKey,
  }));
}
