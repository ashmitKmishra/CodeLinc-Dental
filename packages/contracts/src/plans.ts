import type { ClassRule, CoverageClass, FrequencyLimit, PlanSummary } from './schemas';

/**
 * Plan fixtures normalized from five real carrier summaries of benefits. They show the backend
 * what shapes `PlanSummary` must hold. Page numbers are PDF page numbers. `null` means "not stated".
 * Keep them in sync with the PDFs if the model changes.
 */

type R = { class: CoverageClass; bps: number | null; ded: boolean | null; counts: boolean; label?: string; examples?: string; page?: number };

const rules = (tierId: string, rs: R[]): ClassRule[] =>
  rs.map((r) => ({
    class: r.class,
    tierId,
    carrierLabel: r.label,
    examples: r.examples,
    insurerRateBps: r.bps,
    deductibleApplies: r.ded,
    countsTowardAnnualMax: r.counts,
    source: r.page ? { page: r.page } : undefined,
  }));

const freq = (key: string, label: string, maxCount: number | null, period: FrequencyLimit['period'], months: number | null, ageUnder: number | null, page: number, note?: string): FrequencyLimit => ({
  key, label, maxCount, period, months, ageUnder, note, source: { page },
});

// ------------------------------------------------------------------ Lincoln Financial Group, group dental (indemnity)
export const lincoln: PlanSummary = {
  id: 'lincoln-group-dental',
  carrier: 'Lincoln Financial Group',
  name: 'Group Dental Insurance',
  planYear: { startMonth: 1, startDay: 1, label: 'Calendar year' },
  sourceDocument: { fileName: 'lincoln_national_dental_plan_information.pdf', pages: 2 },
  tiers: [{ id: 'any', label: 'Any dentist', kind: 'any', allowedBasis: 'usual_customary', allowedNote: "Covered expenses won't exceed the policy's usual and customary allowances." }],
  classRules: rules('any', [
    { class: 'preventive', bps: 10000, ded: false, counts: true, examples: 'Routine exams, X-rays, teeth cleanings, fluoride for children, space maintainers for children', page: 1 },
    { class: 'basic', bps: 8000, ded: true, counts: true, examples: 'Fillings, sealants, root canals, periodontal surgery and maintenance, extractions and most oral surgery, emergency relief of pain, general anesthesia', page: 1 },
    { class: 'major', bps: 5000, ded: true, counts: true, examples: 'Crowns and bridges, dentures', page: 1 },
    { class: 'ortho', bps: 5000, ded: null, counts: false, examples: 'Orthodontic exams, X-rays, extractions, study models and appliances (child coverage)', page: 1 },
  ]),
  deductibles: [{ tierId: 'any', individualCents: 2500, familyCents: 7500, source: { page: 1 } }],
  annualMax: { amountCents: 150000, appliesToClasses: ['preventive', 'basic', 'major'], source: { page: 1 } },
  orthoMax: { type: 'lifetime', childCents: 150000, adultCents: null, childAgeLimit: 19, adultsCovered: false, source: { page: 1 } },
  frequencyLimits: [],
  waitingPeriods: [
    { class: 'basic', months: 0, source: { page: 1 } },
    { class: 'major', months: 0, source: { page: 1 } },
    { class: 'ortho', months: 0, source: { page: 1 } },
  ],
  dependentAgeLimit: { age: 19, studentAge: 23 },
  procedureClassOverrides: {},
  notes: [
    { title: 'Any dentist', plain: 'You can choose any dentist and don’t need a referral to see a specialist.', source: { page: 1 } },
    { title: 'Alternative benefits', plain: 'When there’s more than one way to treat a problem, the plan may pay based on the lowest-cost treatment that’s generally effective. For example, it covers silver fillings on back teeth even if you choose tooth-colored ones.', source: { page: 2 } },
    { title: 'Ask before big work', plain: 'Lincoln recommends asking for a predetermination of benefits before a procedure when you expect to pay more than $300.', source: { page: 2 } },
    { title: 'Not covered', plain: 'Implants, veneers and cosmetic work, nitrous oxide, athletic mouth guards and TMJ treatment aren’t covered. The plan also doesn’t pay for services started before coverage begins.', source: { page: 2 } },
  ],
  isSynthetic: false,
};

// ------------------------------------------------------------------ Delta Dental PPO (Point-of-Service), High plan: three provider tiers
const deltaTier = (): R[] => [
  { class: 'preventive', bps: 10000, ded: false, counts: true, examples: 'Exams, cleanings, fluoride, space maintainers, X-rays, sealants, emergency pain relief', page: 1 },
  { class: 'basic', bps: 8000, ded: true, counts: true, examples: 'Fillings and crown repair, root canals, gum disease treatment, extractions and oral surgery, repairs to bridges, implants and dentures', page: 1 },
  { class: 'major', bps: 5000, ded: true, counts: true, examples: 'Crowns, bridges, implants and dentures', page: 1 },
  { class: 'ortho', bps: 5000, ded: false, counts: false, examples: 'Braces', page: 1 },
];
export const delta: PlanSummary = {
  id: 'delta-ppo-pos-high',
  carrier: 'Delta Dental of Indiana',
  name: 'Delta Dental PPO (Point-of-Service), High Plan',
  planYear: { startMonth: 1, startDay: 1, label: 'Benefit year' },
  sourceDocument: { fileName: 'Delta Dental Benefits-Plan-Summary-High.pdf', pages: 4 },
  tiers: [
    { id: 'ppo', label: 'Delta Dental PPO dentist', kind: 'in_network', allowedBasis: 'contracted', allowedNote: 'Percentages apply to Delta Dental’s allowance for each service.' },
    { id: 'premier', label: 'Delta Dental Premier dentist', kind: 'in_network', allowedBasis: 'contracted', allowedNote: 'Percentages apply to Delta Dental’s allowance for each service.' },
    { id: 'nonpar', label: 'Nonparticipating dentist', kind: 'out_of_network', allowedBasis: 'nonparticipating_fee', allowedNote: 'Delta pays its percentage of the Nonparticipating Dentist Fee, which may be less than what your dentist charges. You pay the difference.' },
  ],
  classRules: [...rules('ppo', deltaTier()), ...rules('premier', deltaTier()), ...rules('nonpar', deltaTier())],
  deductibles: [
    { tierId: 'ppo', individualCents: 5000, familyCents: 15000, source: { page: 2 } },
    { tierId: 'premier', individualCents: 7500, familyCents: 22500, source: { page: 2 } },
    { tierId: 'nonpar', individualCents: 7500, familyCents: 22500, source: { page: 2 } },
  ],
  annualMax: { amountCents: 200000, appliesToClasses: ['preventive', 'basic', 'major'], source: { page: 2 } },
  orthoMax: { type: 'lifetime', childCents: 150000, adultCents: 150000, childAgeLimit: null, adultsCovered: true, source: { page: 2 } },
  frequencyLimits: [
    freq('exam', 'Oral exams', 2, 'calendar_year', null, null, 1),
    freq('cleaning', 'Cleanings', 2, 'calendar_year', null, null, 1, 'People with certain health conditions may qualify for more.'),
    freq('fluoride', 'Fluoride treatments', 1, 'calendar_year', null, 19, 1),
    freq('bitewings', 'Bitewing X-rays', 1, 'calendar_year', null, null, 2),
    freq('full_mouth_xray', 'Full-mouth X-rays', 1, 'months', 60, null, 2),
    freq('sealant', 'Sealants (molars, per tooth)', 1, 'months', 60, 14, 2),
    freq('crown', 'Crowns, onlays and inlays (per tooth)', 1, 'months', 84, null, 2),
    freq('denture', 'Full and partial dentures', 1, 'months', 84, null, 2),
    freq('bridge', 'Bridges', 1, 'months', 84, null, 2),
    freq('implant', 'Implants (per tooth)', 1, 'months', 84, null, 2),
  ],
  waitingPeriods: [],
  dependentAgeLimit: { age: 26, studentAge: null },
  procedureClassOverrides: {},
  notes: [
    { title: 'Deductible exceptions', plain: 'The deductible doesn’t apply to exams and cleanings, emergency pain relief, brush biopsy, X-rays, sealants or orthodontics.', source: { page: 2 } },
    { title: 'Two separate maximums', plain: 'The $2,000 yearly maximum covers everything except orthodontics. Orthodontics has its own $1,500 lifetime maximum.', source: { page: 2 } },
    { title: 'Waiting period', plain: 'There’s no special waiting period for this plan. You’re covered once you meet your own employer’s waiting period.', source: { page: 2 } },
    { title: 'Nonparticipating dentists', plain: 'If your dentist doesn’t participate, the plan pays its percentage of its own fee schedule and you pay anything your dentist charges above that.', source: { page: 1 } },
  ],
  isSynthetic: false,
};

// ------------------------------------------------------------------ Aetna Gold Passive PPO: same percentages, in/out of network differ by how the allowed amount is set
const aetnaTier: R[] = [
  { class: 'preventive', bps: 10000, ded: false, counts: true, examples: 'Oral exams, cleanings, fluoride, sealants, X-rays, space maintainers', page: 1 },
  { class: 'basic', bps: 8000, ded: true, counts: true, examples: 'Root canals, scaling and root planing, fillings, stainless steel crowns, extractions, oral surgery, anesthesia, crown lengthening', page: 1 },
  { class: 'major', bps: 8000, ded: true, counts: true, examples: 'Inlays, onlays, crowns, dentures, bridges (pontics), implants, crown build-ups', page: 2 },
  { class: 'ortho', bps: 5000, ded: false, counts: false, examples: 'Orthodontics for adults and children', page: 1 },
];
export const aetna: PlanSummary = {
  id: 'aetna-gold-ppo',
  carrier: 'Aetna',
  name: 'Aetna Dental Gold, Passive PPO',
  planYear: { startMonth: 1, startDay: 1, label: 'Plan year' },
  sourceDocument: { fileName: 'Aetna Summary of benefits.pdf', pages: 6 },
  tiers: [
    { id: 'in', label: 'In network (PPOII and Extend)', kind: 'in_network', allowedBasis: 'contracted', allowedNote: 'Participating dentists have agreed to negotiated rates.' },
    { id: 'out', label: 'Out of network', kind: 'out_of_network', allowedBasis: 'percentile', allowedNote: 'Out-of-network payments are based on the 70th percentile of prevailing charges for your area. You pay anything above that.' },
  ],
  classRules: [...rules('in', aetnaTier), ...rules('out', aetnaTier)],
  deductibles: [
    { tierId: 'in', individualCents: 5000, familyCents: 15000, source: { page: 1 } },
    { tierId: 'out', individualCents: 5000, familyCents: 15000, source: { page: 1 } },
  ],
  annualMax: { amountCents: 250000, appliesToClasses: ['preventive', 'basic', 'major'], source: { page: 1 } },
  orthoMax: { type: 'lifetime', childCents: 200000, adultCents: 200000, childAgeLimit: null, adultsCovered: true, source: { page: 1 } },
  frequencyLimits: [],
  waitingPeriods: [],
  dependentAgeLimit: null,
  procedureClassOverrides: {},
  notes: [
    { title: 'Deductible', plain: 'The deductible applies to basic and major services only. Orthodontics has no deductible.', source: { page: 1 } },
    { title: 'Frequency and age limits', plain: 'Some services, like cleanings, exams and certain gum treatments, have frequency or age limits described in your booklet. This summary doesn’t list them.', source: { page: 2 } },
    { title: 'Alternate treatment rule', plain: 'If more than one treatment would work, Aetna may cover only the less costly one. If you choose the more costly one, you pay the difference.', source: { page: 5 } },
    { title: 'Replacing crowns and dentures', plain: 'Replacements are covered only in specific cases, such as when the old one can’t be repaired and is at least 7 years old.', source: { page: 4 } },
  ],
  isSynthetic: false,
};

// ------------------------------------------------------------------ MetLife Federal Dental: two options, carrier class names don't match the usual ones
const metlifeTiers = (std: boolean): { rules: ClassRule[]; ded: PlanSummary['deductibles'] } => ({
  rules: [
    ...rules('in', [
      { class: 'preventive', bps: 10000, ded: true, counts: true, label: 'Basic', examples: 'Cleanings, X-rays and oral exams', page: 7 },
      { class: 'basic', bps: std ? 5500 : 7000, ded: true, counts: true, label: 'Intermediate', examples: 'Fillings and periodontal maintenance', page: 7 },
      { class: 'major', bps: std ? 3500 : 5000, ded: true, counts: true, label: 'Major', examples: 'Crowns, bridges, root canal treatment and dentures', page: 7 },
      { class: 'ortho', bps: 5000, ded: false, counts: false, label: 'Orthodontic', examples: 'Comprehensive orthodontic treatment, fixed appliances', page: 7 },
    ]),
    ...rules('out', [
      { class: 'preventive', bps: std ? 6000 : 9000, ded: true, counts: true, label: 'Basic', page: 7 },
      { class: 'basic', bps: std ? 4000 : 6000, ded: true, counts: true, label: 'Intermediate', page: 7 },
      { class: 'major', bps: std ? 2000 : 4000, ded: true, counts: true, label: 'Major', page: 7 },
      { class: 'ortho', bps: 5000, ded: false, counts: false, label: 'Orthodontic', page: 7 },
    ]),
  ],
  ded: [
    { tierId: 'in', individualCents: 0, familyCents: null, source: { page: 7 } },
    { tierId: 'out', individualCents: std ? 10000 : 5000, familyCents: null, source: { page: 7 } },
  ],
});
const metlifeBase = {
  carrier: 'MetLife',
  planYear: { startMonth: 1, startDay: 1, label: 'Calendar year' },
  sourceDocument: { fileName: 'Metlife Summary of benefits.pdf', pages: 10 },
  tiers: [
    { id: 'in', label: 'In network', kind: 'in_network', allowedBasis: 'contracted', allowedNote: 'Plan pays a percentage of the negotiated fee (the Plan Allowance).' },
    { id: 'out', label: 'Out of network', kind: 'out_of_network', allowedBasis: 'contracted', allowedNote: 'Plan pays a percentage of the in-network Plan Allowance. You pay the difference between your dentist’s fee and the plan’s payment.' },
  ],
  frequencyLimits: [
    freq('exam', 'Oral evaluations', 1, 'months', 6, null, 5),
    freq('cleaning', 'Cleanings', 1, 'months', 6, null, 5),
    freq('bitewings', 'Bitewing X-rays', 1, 'calendar_year', null, null, 5, 'Children: one set every 6 months. Adults: one set every calendar year.'),
    freq('fluoride', 'Fluoride', 1, 'months', 12, null, 5, 'Children: two every 12 months. Adults: one every 12 months.'),
    freq('scaling', 'Scaling and root planing (4+ teeth per quadrant)', 1, 'months', 24, null, 5),
    freq('steel_crown', 'Stainless steel crowns (per tooth)', 1, 'months', 60, null, 5),
  ],
  waitingPeriods: [
    { class: 'basic', months: 0, source: { page: 4 } },
    { class: 'major', months: 0, source: { page: 4 } },
    { class: 'ortho', months: 0, source: { page: 6 } },
  ],
  dependentAgeLimit: null,
  procedureClassOverrides: { D3310: 'major', D3330: 'major' } as Record<string, CoverageClass>,
  isSynthetic: false,
} satisfies Partial<PlanSummary>;
export const metlifeStandard: PlanSummary = {
  ...metlifeBase,
  id: 'metlife-federal-standard',
  name: 'Federal Dental Plan, Standard Option',
  classRules: metlifeTiers(true).rules,
  deductibles: metlifeTiers(true).ded,
  annualMax: { amountCents: 200000, appliesToClasses: ['preventive', 'basic', 'major'], source: { page: 7 } },
  orthoMax: { type: 'lifetime', childCents: 150000, adultCents: 150000, childAgeLimit: null, adultsCovered: true, source: { page: 7 } },
  notes: [
    { title: 'Deductible', plain: 'No deductible in network. Out of network it’s $100 per person.', source: { page: 7 } },
    { title: 'Orthodontics', plain: 'Covered for children and adults at 50%, up to a $1,500 lifetime maximum each. There’s no waiting period.', source: { page: 7 } },
    { title: 'Class names', plain: 'MetLife calls preventive care “Basic” and fillings “Intermediate”. Root canals are treated as major care on this plan.', source: { page: 7 } },
  ],
};
export const metlifeHigh: PlanSummary = {
  ...metlifeBase,
  id: 'metlife-federal-high',
  name: 'Federal Dental Plan, High Option',
  classRules: metlifeTiers(false).rules,
  deductibles: metlifeTiers(false).ded,
  annualMax: { amountCents: null, appliesToClasses: ['preventive', 'basic', 'major'], source: { page: 7 } },
  orthoMax: { type: 'lifetime', childCents: 350000, adultCents: 300000, childAgeLimit: null, adultsCovered: true, source: { page: 7 } },
  notes: [
    { title: 'No yearly cap', plain: 'The High Option has an unlimited annual maximum for everything except orthodontics.', source: { page: 7 } },
    { title: 'Deductible', plain: 'No deductible in network. Out of network it’s $50 per person.', source: { page: 7 } },
    { title: 'Orthodontics', plain: 'Covered at 50% up to a $3,500 lifetime maximum for a child and $3,000 for an adult.', source: { page: 7 } },
  ],
};

// ------------------------------------------------------------------ Cigna Dental 3000/100: you-pay percentages, no orthodontics
const cignaTier: R[] = [
  { class: 'preventive', bps: 10000, ded: true, counts: true, examples: 'Routine cleanings, oral exams, routine and nonroutine X-rays, sealants, fluoride, space maintainers, emergency treatment', page: 1 },
  { class: 'basic', bps: 5000, ded: true, counts: true, examples: 'Anesthesia, fillings, periodontics, oral surgery, simple extractions, relines and repairs, root canals, impacted tooth removal', page: 1 },
  { class: 'major', bps: 5000, ded: true, counts: true, examples: 'Crowns, prosthesis over implant, dentures, bridges', page: 1 },
  { class: 'ortho', bps: null, ded: null, counts: false, examples: 'Orthodontia', page: 1 },
];
export const cigna: PlanSummary = {
  id: 'cigna-dental-3000-100',
  carrier: 'Cigna Healthcare',
  name: 'Cigna Dental 3000/100',
  planYear: { startMonth: 1, startDay: 1, label: 'Calendar year' },
  sourceDocument: { fileName: 'Cigna Summary of benefits.pdf', pages: 7 },
  tiers: [
    { id: 'in', label: 'Total Network', kind: 'in_network', allowedBasis: 'contracted', allowedNote: 'Based on your provider’s contracted fees.' },
    { id: 'out', label: 'Out of network', kind: 'out_of_network', allowedBasis: 'contracted', allowedNote: 'You pay the plan’s share plus the difference between your dentist’s actual charge and Cigna’s contracted fee (balance billing).' },
  ],
  classRules: [...rules('in', cignaTier), ...rules('out', cignaTier)],
  deductibles: [
    { tierId: 'in', individualCents: 10000, familyCents: null, source: { page: 1 } },
    { tierId: 'out', individualCents: 10000, familyCents: null, source: { page: 1 } },
  ],
  annualMax: { amountCents: 300000, appliesToClasses: ['preventive', 'basic', 'major'], source: { page: 1 } },
  orthoMax: { type: 'none', childCents: null, adultCents: null, childAgeLimit: null, adultsCovered: false, source: { page: 1 } },
  frequencyLimits: [
    freq('cleaning', 'Routine cleanings', 2, 'calendar_year', null, null, 2),
    freq('exam', 'Oral exams', 2, 'calendar_year', null, null, 2),
    freq('bitewings', 'Bitewing X-rays', 2, 'calendar_year', null, null, 2),
    freq('full_mouth_xray', 'Full-mouth X-rays', 1, 'months', 36, null, 2),
    freq('sealant', 'Sealants (per tooth)', 1, 'months', 36, 14, 2),
    freq('fluoride', 'Fluoride', 1, 'calendar_year', null, 19, 2),
    freq('crown', 'Crowns (per tooth)', 1, 'months', 60, null, 2),
  ],
  waitingPeriods: [],
  dependentAgeLimit: null,
  procedureClassOverrides: {},
  notes: [
    { title: 'You pay, not the plan', plain: 'Cigna lists what you pay: $0 for preventive care and 50% for basic and major care, in both cases after the $100 deductible.', source: { page: 1 } },
    { title: 'No orthodontics', plain: 'Orthodontia isn’t covered by this plan, in or out of network.', source: { page: 1 } },
    { title: 'Balance billing', plain: 'Out of network, you pay the difference between your dentist’s charge and Cigna’s contracted fee, on top of your share.', source: { page: 1 } },
  ],
  isSynthetic: false,
};

export const planFixtures: Record<string, PlanSummary> = {
  lincoln,
  delta,
  aetna,
  'metlife-standard': metlifeStandard,
  'metlife-high': metlifeHigh,
  cigna,
};
export const defaultPlanKey = 'lincoln';
