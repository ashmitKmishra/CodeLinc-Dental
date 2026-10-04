import { defaultPlanKey, planFixtures, resolveProcedures, type Member, type Message, type PendingAction, type PlanSummary, type Preferences, type Procedure, type Turn, type Visit, type Messaging } from '@floss/contracts';
import { emptyState, estimateItem, iso, parseIso, planYearOf, type MemberState } from './engine';

export type PendingPayload = { type: 'record_visit'; memberId: string; procedureCode: string; quoteCents: number; date: string } | { type: 'email_transcript' };

const allMembers: Member[] = [
  { id: 'm-jordan', firstName: 'Jordan', relationship: 'self', birthDate: '1988-04-12' },
  { id: 'm-sam', firstName: 'Sam', relationship: 'spouse', birthDate: '1989-09-03' },
  { id: 'm-maya', firstName: 'Maya', relationship: 'child', birthDate: '2012-06-18' },
  { id: 'm-leo', firstName: 'Leo', relationship: 'child', birthDate: '2018-02-09' },
];

export const flossNumber = '+1 (555) 010-0199';
export const todayIso = () => iso(new Date());
export const uid = () => crypto.randomUUID();

export class MockStore {
  planKey = new URLSearchParams(globalThis.location?.search ?? '').get('plan') ?? defaultPlanKey;
  /** 'solo' = just the employee, 'family' = employee, spouse and two children. */
  householdMode: 'family' | 'solo' = new URLSearchParams(globalThis.location?.search ?? '').get('household') === 'solo' ? 'solo' : 'family';
  visits: Visit[] = [];
  messages: Message[] = [];
  pending: { action: PendingAction; payload: PendingPayload }[] = [];
  turns = new Map<string, Turn>();
  linkCode: string | null = null;
  messaging: Messaging = { status: 'unlinked', flossNumber, mode: 'simulated' };
  preferences: Preferences = { remindersOptIn: true, reminderDaysBefore: [60, 30, 14], quietHours: { start: '21:00', end: '09:00' } };
  revision = 1;
  /** Live mode: the signed-in user's real household replaces the sample one. */
  membersOverride: Member[] | null = null;

  constructor() {
    if (!planFixtures[this.planKey]) this.planKey = defaultPlanKey;
    this.seed();
  }

  get members(): Member[] { if (this.membersOverride) return this.membersOverride; return this.householdMode === 'solo' ? allMembers.slice(0, 1) : allMembers; }
  get plan(): PlanSummary { return planFixtures[this.planKey]!; }
  get procedures(): Procedure[] { return resolveProcedures(this.plan); }
  bump() { this.revision += 1; }

  /** Sample visits earlier this plan year, priced by the stand-in engine so usage is consistent with the plan. */
  seed() {
    this.visits = []; this.messages = []; this.pending = []; this.turns.clear(); this.linkCode = null;
    this.messaging = { status: 'unlinked', flossNumber, mode: 'simulated' };
    const today = todayIso();
    const year = planYearOf(this.plan, today);
    const start = parseIso(year.start).getTime();
    const elapsed = Math.max(0, parseIso(today).getTime() - start);
    const at = (f: number) => iso(new Date(start + Math.floor(elapsed * f)));
    const plan: [string, string, number, number][] = [ // member, code, quote in cents, fraction of the year elapsed
      ['m-jordan', 'D1110', 12000, 0.2], ['m-sam', 'D1110', 12000, 0.35], ['m-jordan', 'D2391', 18000, 0.5], ['m-leo', 'D1120', 9500, 0.65],
    ];
    const states = new Map<string, MemberState>(this.members.map((m) => [m.id, emptyState()]));
    let fam = 0;
    const tier = this.plan.tiers.find((t) => t.kind !== 'out_of_network') ?? this.plan.tiers[0]!;
    for (const [memberId, code, quoteCents, f] of plan.filter(([id]) => this.members.some((m) => m.id === id))) {
      const member = this.members.find((m) => m.id === memberId)!;
      const proc = this.procedures.find((p) => p.code === code)!;
      const date = at(f);
      const r = estimateItem({ plan: this.plan, tier, member, todayIso: date, proc, quoteCents }, states.get(memberId)!, fam);
      states.set(memberId, r.state); fam += r.deductibleApplied;
      this.visits.push({ id: uid(), memberId, date, procedureCode: code, label: proc.plainName, billedCents: quoteCents, planPaidCents: r.item.planPaysCents, youPaidCents: r.item.youPayCents, deductibleAppliedCents: r.deductibleApplied, source: 'app' });
    }
    this.visits.sort((a, b) => b.date.localeCompare(a.date));
    this.bump();
  }
}
