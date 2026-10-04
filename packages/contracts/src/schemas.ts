import { z } from 'zod';

/**
 * Floss API contract. Source of truth for what the backend sends and the web app reads.
 * Money is integer cents. Rates are basis points (8000 = plan pays 80%). Dates are ISO strings.
 * `null` always means "not stated in the plan document", never zero.
 */

export const Cents = z.number().int();
export const IsoDate = z.string(); // YYYY-MM-DD
export const IsoDateTime = z.string();

// ---------------------------------------------------------------- plan (normalized from carrier PDFs)

export const CoverageClass = z.enum(['preventive', 'basic', 'major', 'ortho']);
export type CoverageClass = z.infer<typeof CoverageClass>;

/** Where in the plan document a fact came from. */
export const Source = z.object({ page: z.number().int().nullable(), quote: z.string().optional() });
export type Source = z.infer<typeof Source>;

/** A way of getting care: in network, out of network, a carrier's own tier, or "any dentist". */
export const NetworkTier = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(['in_network', 'out_of_network', 'any']),
  /** What the plan's percentage is applied to. */
  allowedBasis: z.enum(['contracted', 'usual_customary', 'percentile', 'nonparticipating_fee', 'unknown']),
  allowedNote: z.string().optional(),
});
export type NetworkTier = z.infer<typeof NetworkTier>;

export const ClassRule = z.object({
  class: CoverageClass,
  tierId: z.string(),
  /** The carrier's own name for the class, e.g. MetLife calls preventive "Basic". */
  carrierLabel: z.string().optional(),
  examples: z.string().optional(),
  /** Plan pays this share of the allowed amount. null = not covered. */
  insurerRateBps: z.number().int().min(0).max(10000).nullable(),
  /** null = the summary doesn't say. */
  deductibleApplies: z.boolean().nullable(),
  countsTowardAnnualMax: z.boolean(),
  source: Source.optional(),
});
export type ClassRule = z.infer<typeof ClassRule>;

export const DeductibleRule = z.object({
  tierId: z.string(),
  individualCents: Cents.nullable(),
  familyCents: Cents.nullable(),
  source: Source.optional(),
});
export type DeductibleRule = z.infer<typeof DeductibleRule>;

export const AnnualMax = z.object({
  /** null = unlimited. */
  amountCents: Cents.nullable(),
  appliesToClasses: z.array(CoverageClass),
  source: Source.optional(),
});
export type AnnualMax = z.infer<typeof AnnualMax>;

export const OrthoMax = z.object({
  type: z.enum(['lifetime', 'annual', 'none']),
  childCents: Cents.nullable(),
  adultCents: Cents.nullable(),
  /** Children up to this age (inclusive of the year before) count as child coverage. null = no limit stated. */
  childAgeLimit: z.number().int().nullable(),
  adultsCovered: z.boolean(),
  source: Source.optional(),
});
export type OrthoMax = z.infer<typeof OrthoMax>;

export const FrequencyLimit = z.object({
  key: z.string(), // 'cleaning', 'exam', 'bitewings', 'full_mouth_xray', 'fluoride', 'sealant', 'crown', ...
  label: z.string(),
  maxCount: z.number().int().nullable(),
  period: z.enum(['calendar_year', 'benefit_year', 'months', 'lifetime']),
  months: z.number().int().nullable(),
  ageUnder: z.number().int().nullable(),
  note: z.string().optional(),
  source: Source.optional(),
});
export type FrequencyLimit = z.infer<typeof FrequencyLimit>;

export const WaitingPeriod = z.object({ class: CoverageClass, months: z.number().int(), source: Source.optional() });
export type WaitingPeriod = z.infer<typeof WaitingPeriod>;

export const PlanNote = z.object({ title: z.string(), plain: z.string(), source: Source.optional() });
export type PlanNote = z.infer<typeof PlanNote>;

export const PlanSummary = z.object({
  id: z.string(),
  carrier: z.string(),
  name: z.string(),
  planYear: z.object({ startMonth: z.number().int().min(1).max(12), startDay: z.number().int().min(1).max(31), label: z.string() }),
  sourceDocument: z.object({ fileName: z.string(), pages: z.number().int() }),
  tiers: z.array(NetworkTier).min(1),
  classRules: z.array(ClassRule),
  deductibles: z.array(DeductibleRule),
  annualMax: AnnualMax,
  orthoMax: OrthoMax,
  frequencyLimits: z.array(FrequencyLimit),
  waitingPeriods: z.array(WaitingPeriod),
  /** Dependent children covered up to this age, and up to studentAge if full-time students. */
  dependentAgeLimit: z.object({ age: z.number().int().nullable(), studentAge: z.number().int().nullable() }).nullable(),
  /** Procedures this plan classes differently from the usual (e.g. root canal is "major" on MetLife). */
  procedureClassOverrides: z.record(z.string(), CoverageClass).default({}),
  notes: z.array(PlanNote),
  /** True while the data is sample data rather than a real member's plan. */
  isSynthetic: z.boolean(),
});
export type PlanSummary = z.infer<typeof PlanSummary>;

// ---------------------------------------------------------------- household and usage

export const Member = z.object({
  id: z.string(),
  firstName: z.string(),
  relationship: z.enum(['self', 'spouse', 'child', 'other']),
  birthDate: IsoDate,
  /** Insurer member ID, when the backend has one. */
  memberNumber: z.string().nullish(),
});
export type Member = z.infer<typeof Member>;

export const MemberUsage = z.object({
  memberId: z.string(),
  planYear: z.object({ start: IsoDate, end: IsoDate, daysToReset: z.number().int() }),
  /** null = unlimited */
  annualMaxCents: Cents.nullable(),
  usedCents: Cents,
  remainingCents: Cents.nullable(),
  deductibleCents: Cents.nullable(),
  deductibleMetCents: Cents,
  orthoLifetime: z.object({ maxCents: Cents.nullable(), usedCents: Cents }).nullable(),
  frequency: z.array(z.object({ key: z.string(), label: z.string(), used: z.number().int(), allowed: z.number().int().nullable() })),
});
export type MemberUsage = z.infer<typeof MemberUsage>;

export const Visit = z.object({
  id: z.string(),
  memberId: z.string(),
  date: IsoDate,
  procedureCode: z.string(),
  label: z.string(),
  billedCents: Cents,
  planPaidCents: Cents,
  youPaidCents: Cents,
  deductibleAppliedCents: Cents,
  source: z.enum(['app', 'sms']),
});
export type Visit = z.infer<typeof Visit>;

export const Procedure = z.object({
  code: z.string(),
  name: z.string(),
  plainName: z.string(),
  description: z.string(),
  /** Resolved for the member's plan. */
  coverageClass: CoverageClass,
  frequencyKey: z.string().nullable(),
});
export type Procedure = z.infer<typeof Procedure>;

// ---------------------------------------------------------------- estimates and sequences

export const EstimateLine = z.object({
  step: z.enum(['eligibility', 'fee', 'deductible', 'insurer_rate', 'annual_max', 'balance_bill', 'patient']),
  amountCents: Cents,
  /** The plan rule used, in the carrier's terms. */
  rule: z.string(),
  /** One plain sentence, with the real numbers. */
  why: z.string(),
  source: Source.optional(),
});
export type EstimateLine = z.infer<typeof EstimateLine>;

export const EstimateItem = z.object({
  procedureCode: z.string(),
  label: z.string(),
  coverageClass: CoverageClass,
  status: z.enum(['covered', 'not_covered', 'incomplete']),
  notCoveredReason: z.string().optional(),
  billedCents: Cents,
  allowedCents: Cents,
  deductibleAppliedCents: Cents,
  planPaysCents: Cents,
  balanceBillCents: Cents,
  youPayCents: Cents,
  lines: z.array(EstimateLine),
});
export type EstimateItem = z.infer<typeof EstimateItem>;

export const EstimateRequest = z.object({
  memberId: z.string(),
  tierId: z.string(),
  date: IsoDate,
  items: z.array(z.object({ procedureCode: z.string(), quoteCents: Cents, allowedCents: Cents.optional() })).min(1),
});
export type EstimateRequest = z.infer<typeof EstimateRequest>;

export const Estimate = z.object({
  id: z.string(),
  memberId: z.string(),
  tierId: z.string(),
  tierLabel: z.string(),
  date: IsoDate,
  items: z.array(EstimateItem),
  totals: z.object({ billedCents: Cents, planPaysCents: Cents, youPayCents: Cents }),
  remainingAnnualMaxAfterCents: Cents.nullable(),
  assumptions: z.array(z.string()),
  computedAt: IsoDateTime,
});
export type Estimate = z.infer<typeof Estimate>;

export const SequenceRequest = z.object({
  memberId: z.string(),
  tierId: z.string(),
  items: z.array(z.object({ procedureCode: z.string(), quoteCents: Cents, allowedCents: Cents.optional(), canWait: z.boolean() })).min(1).max(8),
});
export type SequenceRequest = z.infer<typeof SequenceRequest>;

export const SequenceStep = z.object({
  procedureCode: z.string(),
  label: z.string(),
  window: z.enum(['this_plan_year', 'next_plan_year']),
  estimate: EstimateItem,
});
export type SequenceStep = z.infer<typeof SequenceStep>;

export const Sequence = z.object({
  planYearEnds: IsoDate,
  baseline: z.object({ steps: z.array(SequenceStep), youPayCents: Cents }),
  best: z.object({ steps: z.array(SequenceStep), youPayCents: Cents }),
  differenceCents: Cents,
  reasons: z.array(z.string()),
  assumptions: z.array(z.string()),
  candidatesTried: z.number().int(),
});
export type Sequence = z.infer<typeof Sequence>;

// ---------------------------------------------------------------- chat

export const PendingAction = z.object({
  id: z.string(),
  type: z.enum(['record_visit', 'email_transcript']),
  previewText: z.string(),
  /** What the user can say by text to confirm: "CONFIRM K7Q2". */
  confirmToken: z.string(),
  status: z.enum(['pending', 'applied', 'cancelled', 'expired']),
  expiresAt: IsoDateTime,
});
export type PendingAction = z.infer<typeof PendingAction>;

export const Card = z.discriminatedUnion('type', [
  z.object({ type: z.literal('estimate'), estimate: Estimate }),
  z.object({ type: z.literal('sequence'), sequence: Sequence }),
  z.object({ type: z.literal('usage'), memberId: z.string() }),
  z.object({ type: z.literal('pending_action'), action: PendingAction }),
]);
export type Card = z.infer<typeof Card>;

export const Message = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  channel: z.enum(['app', 'sms', 'email', 'whatsapp']),
  text: z.string(),
  cards: z.array(Card),
  createdAt: IsoDateTime,
  delivery: z.object({ status: z.enum(['queued', 'sent', 'delivered', 'failed', 'simulated']), at: IsoDateTime }).optional(),
});
export type Message = z.infer<typeof Message>;

/** One chat thread. Each belongs to a single channel, so the app and WhatsApp Messenger histories stay separate. */
export const Conversation = z.object({
  id: z.string(),
  channel: Message.shape.channel,
  title: z.string(),
  updatedAt: IsoDateTime,
  messageCount: z.number().int(),
});
export type Conversation = z.infer<typeof Conversation>;

export const Turn = z.object({
  id: z.string(),
  status: z.enum(['queued', 'working', 'completed', 'failed']),
  reply: Message.optional(),
  error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }).optional(),
});
export type Turn = z.infer<typeof Turn>;

// ---------------------------------------------------------------- reminders, texting, preferences

export const Reminder = z.object({
  id: z.string(),
  kind: z.literal('benefits_expiring'),
  memberId: z.string().nullable(),
  title: z.string(),
  body: z.string(),
  sendOn: IsoDate,
  status: z.enum(['scheduled', 'sent']),
});
export type Reminder = z.infer<typeof Reminder>;

export const Preferences = z.object({
  remindersOptIn: z.boolean(),
  /** Send a reminder this many days before the plan year ends. */
  reminderDaysBefore: z.array(z.number().int()),
  quietHours: z.object({ start: z.string(), end: z.string() }),
});
export type Preferences = z.infer<typeof Preferences>;

export const Messaging = z.object({
  status: z.enum(['unlinked', 'awaiting_text', 'awaiting_confirmation', 'linked', 'opted_out']),
  maskedPhone: z.string().optional(),
  flossNumber: z.string(),
  mode: z.enum(['live', 'simulated']),
});
export type Messaging = z.infer<typeof Messaging>;

// ---------------------------------------------------------------- snapshot (GET /v1/snapshot)

export const Snapshot = z.object({
  revision: z.number().int(),
  serverTime: IsoDateTime,
  user: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  household: z.object({ id: z.string(), name: z.string(), members: z.array(Member) }),
  plan: PlanSummary,
  usage: z.array(MemberUsage),
  visits: z.array(Visit),
  reminders: z.array(Reminder),
  preferences: Preferences,
  messages: z.array(Message),
  pendingActions: z.array(PendingAction),
  messaging: Messaging,
  ai: z.object({ status: z.enum(['available', 'degraded', 'off']) }),
});
export type Snapshot = z.infer<typeof Snapshot>;

export const ApiError = z.object({
  error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean(), requestId: z.string().optional(), fields: z.record(z.string(), z.string()).optional() }),
});
export type ApiError = z.infer<typeof ApiError>;
