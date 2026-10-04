/**
 * MOCK ONLY. A small stand-in for the backend's deterministic calculator so the UI can be built and
 * demoed before the real engine exists. The real math lives in the backend; never import this from components.
 */
import type { CoverageClass, Estimate, EstimateItem, EstimateLine, EstimateRequest, Member, MemberUsage, NetworkTier, PlanSummary, Procedure, Sequence, SequenceRequest, SequenceStep, Visit } from '@floss/contracts';
import { ageOn, money, pct } from '@/lib/format';

export interface MemberState { annualUsed: number; deductibleMet: number; orthoUsed: number }
export const emptyState = (): MemberState => ({ annualUsed: 0, deductibleMet: 0, orthoUsed: 0 });

export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const parseIso = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y!, m! - 1, d!); };
const DAY = 86_400_000;

export function planYearOf(plan: PlanSummary, todayIso: string) {
  const t = parseIso(todayIso);
  const { startMonth, startDay } = plan.planYear;
  let y = t.getFullYear();
  if (t < new Date(y, startMonth - 1, startDay)) y -= 1;
  const start = new Date(y, startMonth - 1, startDay);
  const nextStart = new Date(y + 1, startMonth - 1, startDay);
  const end = new Date(nextStart.getTime() - DAY);
  return { start: iso(start), end: iso(end), nextStart: iso(nextStart), daysToReset: Math.max(0, Math.ceil((nextStart.getTime() - t.getTime()) / DAY)) };
}

const className: Record<CoverageClass, string> = { preventive: 'preventive care', basic: 'basic care', major: 'major care', ortho: 'orthodontics' };

interface ItemCtx { plan: PlanSummary; tier: NetworkTier; member: Member; todayIso: string; proc: Procedure; quoteCents: number; allowedCents?: number }

export function estimateItem(ctx: ItemCtx, state: MemberState, familyDeductibleMet: number): { item: EstimateItem; state: MemberState; deductibleApplied: number; assumptions: string[] } {
  const { plan, tier, member, proc, quoteCents } = ctx;
  const cls = proc.coverageClass;
  const rule = plan.classRules.find((r) => r.class === cls && r.tierId === tier.id);
  const assumptions: string[] = [];
  const lines: EstimateLine[] = [];
  const base = { procedureCode: proc.code, label: proc.plainName, coverageClass: cls, billedCents: quoteCents };
  const notCovered = (reason: string, page?: number | null): ReturnType<typeof estimateItem> => ({
    item: { ...base, status: 'not_covered', notCoveredReason: reason, allowedCents: quoteCents, deductibleAppliedCents: 0, planPaysCents: 0, balanceBillCents: 0, youPayCents: quoteCents,
      lines: [{ step: 'eligibility', amountCents: 0, rule: `${className[cls]}`, why: reason, source: page ? { page } : undefined }, { step: 'patient', amountCents: quoteCents, rule: 'Not covered', why: `So you’d pay the full ${money(quoteCents)}.` }] },
    state, deductibleApplied: 0, assumptions,
  });

  if (!rule || rule.insurerRateBps === null) return notCovered(`Your plan doesn’t cover ${className[cls]}.`, rule?.source?.page ?? plan.orthoMax.source?.page);

  // orthodontics: who is covered, and which lifetime maximum applies
  let orthoMax: number | null = null;
  if (cls === 'ortho') {
    if (plan.orthoMax.type === 'none') return notCovered('Your plan doesn’t cover orthodontics.', plan.orthoMax.source?.page);
    const age = ageOn(member.birthDate, ctx.todayIso);
    const isChild = age < (plan.orthoMax.childAgeLimit ?? 19);
    if (!isChild && !plan.orthoMax.adultsCovered) return notCovered(`Orthodontics is covered for children under ${plan.orthoMax.childAgeLimit ?? 19} on your plan, and ${member.firstName} is ${age}.`, plan.orthoMax.source?.page);
    orthoMax = isChild ? plan.orthoMax.childCents : plan.orthoMax.adultCents;
  }

  const allowed = ctx.allowedCents ?? quoteCents;
  if (ctx.allowedCents == null) assumptions.push('We used your dentist’s quote as the allowed amount because plan summaries don’t list fees. Ask your dentist or insurer for the exact allowed amount.');

  const src = rule.source ?? undefined;
  lines.push({ step: 'fee', amountCents: quoteCents, rule: 'Dentist’s quote', why: `Your dentist quoted ${money(quoteCents)}.` });
  if (allowed !== quoteCents || tier.kind !== 'in_network') {
    const basis = { contracted: 'the plan’s contracted fee', usual_customary: 'the usual and customary amount', percentile: 'the plan’s recognized charge', nonparticipating_fee: 'the plan’s fee for dentists outside its network', unknown: 'the plan’s allowed amount' }[tier.allowedBasis];
    lines.push({ step: 'fee', amountCents: allowed, rule: 'Allowed amount', why: `Your plan works from ${money(allowed)}, based on ${basis}.` });
  }

  // deductible
  const ded = plan.deductibles.find((d) => d.tierId === tier.id);
  let dedApplies = rule.deductibleApplies === true;
  if (rule.deductibleApplies === null) assumptions.push(`Your plan summary doesn’t say whether the deductible applies to ${className[cls]}, so we didn’t apply it.`);
  let dedRemaining = ded?.individualCents == null ? 0 : Math.max(0, ded.individualCents - state.deductibleMet);
  if (ded?.familyCents != null) dedRemaining = Math.min(dedRemaining, Math.max(0, ded.familyCents - familyDeductibleMet));
  if (!ded || ded.individualCents == null) dedApplies = false;
  const dedApplied = dedApplies ? Math.min(allowed, dedRemaining) : 0;
  lines.push({
    step: 'deductible', amountCents: dedApplied, rule: dedApplies ? 'Deductible' : 'No deductible', source: ded?.source,
    why: !dedApplies ? `The deductible doesn’t apply to ${className[cls]}.` : dedApplied === 0 ? 'Your deductible for this plan year is already met.' : `${money(dedApplied)} goes toward your yearly deductible first.`,
  });

  // plan share
  const share = Math.round(((allowed - dedApplied) * rule.insurerRateBps) / 10_000);
  lines.push({ step: 'insurer_rate', amountCents: share, rule: `Plan pays ${pct(rule.insurerRateBps)}`, source: src, why: `For ${className[cls]}, your plan pays ${pct(rule.insurerRateBps)} of ${money(allowed - dedApplied)}, which is ${money(share)}.` });

  // maximums
  let planPays = share;
  if (cls === 'ortho') {
    if (orthoMax != null) {
      const left = Math.max(0, orthoMax - state.orthoUsed);
      if (share > left) {
        planPays = left;
        lines.push({ step: 'annual_max', amountCents: left, rule: 'Orthodontic lifetime maximum', source: plan.orthoMax.source, why: `Orthodontics has a ${money(orthoMax)} lifetime maximum and ${money(left)} is left, so the plan pays ${money(left)}.` });
      }
    }
  } else if (rule.countsTowardAnnualMax && plan.annualMax.amountCents != null) {
    const left = Math.max(0, plan.annualMax.amountCents - state.annualUsed);
    if (share > left) {
      planPays = left;
      lines.push({ step: 'annual_max', amountCents: left, rule: 'Annual maximum', source: plan.annualMax.source, why: `You have ${money(left)} left of your ${money(plan.annualMax.amountCents)} annual maximum, so the plan pays ${money(left)}.` });
    }
  }

  const balance = tier.kind !== 'in_network' && quoteCents > allowed ? quoteCents - allowed : 0;
  if (balance > 0) lines.push({ step: 'balance_bill', amountCents: balance, rule: 'Balance billing', source: undefined, why: `Your dentist charges ${money(balance)} more than the plan’s allowed amount, and you’re responsible for the difference.` });
  const youPay = (tier.kind === 'in_network' ? allowed : quoteCents) - planPays;
  lines.push({ step: 'patient', amountCents: youPay, rule: 'You pay', why: `${money(youPay)} is your share.` });

  const next: MemberState = {
    annualUsed: state.annualUsed + (cls !== 'ortho' && rule.countsTowardAnnualMax ? planPays : 0),
    deductibleMet: state.deductibleMet + dedApplied,
    orthoUsed: state.orthoUsed + (cls === 'ortho' ? planPays : 0),
  };
  return { item: { ...base, status: 'covered', allowedCents: allowed, deductibleAppliedCents: dedApplied, planPaysCents: planPays, balanceBillCents: balance, youPayCents: youPay, lines }, state: next, deductibleApplied: dedApplied, assumptions };
}

export interface HouseholdCtx { plan: PlanSummary; members: Member[]; procedures: Procedure[]; visits: Visit[]; todayIso: string }

/** Usage for the current plan year, derived from recorded visits. */
export function deriveStates(ctx: HouseholdCtx): { states: Map<string, MemberState>; familyDeductibleMet: number } {
  const { plan, members, procedures, visits, todayIso } = ctx;
  const year = planYearOf(plan, todayIso);
  const states = new Map(members.map((m) => [m.id, emptyState()]));
  for (const v of visits) {
    const st = states.get(v.memberId);
    if (!st) continue;
    const proc = procedures.find((p) => p.code === v.procedureCode);
    const cls = proc?.coverageClass ?? 'basic';
    if (cls === 'ortho') st.orthoUsed += v.planPaidCents; // lifetime: counts across plan years
    if (v.date >= year.start && v.date <= year.end) {
      if (cls !== 'ortho') st.annualUsed += v.planPaidCents;
      st.deductibleMet += v.deductibleAppliedCents;
    }
  }
  const familyDeductibleMet = [...states.values()].reduce((s, st) => s + st.deductibleMet, 0);
  return { states, familyDeductibleMet };
}

export function deriveUsage(ctx: HouseholdCtx): MemberUsage[] {
  const { plan, members, procedures, visits, todayIso } = ctx;
  const year = planYearOf(plan, todayIso);
  const { states } = deriveStates(ctx);
  const tier = plan.tiers.find((t) => t.kind !== 'out_of_network') ?? plan.tiers[0]!;
  const ded = plan.deductibles.find((d) => d.tierId === tier.id);
  return members.map((m) => {
    const st = states.get(m.id) ?? emptyState();
    const max = plan.annualMax.amountCents;
    const age = ageOn(m.birthDate, todayIso);
    const orthoEligible = plan.orthoMax.type !== 'none' && (plan.orthoMax.adultsCovered || age < (plan.orthoMax.childAgeLimit ?? 19));
    const orthoMax = age < (plan.orthoMax.childAgeLimit ?? 19) ? plan.orthoMax.childCents : plan.orthoMax.adultCents;
    const frequency = plan.frequencyLimits.filter((f) => f.period === 'calendar_year' || f.period === 'benefit_year').map((f) => ({
      key: f.key, label: f.label, allowed: f.maxCount,
      used: visits.filter((v) => v.memberId === m.id && v.date >= year.start && v.date <= year.end && procedures.find((p) => p.code === v.procedureCode)?.frequencyKey === f.key).length,
    }));
    return {
      memberId: m.id,
      planYear: { start: year.start, end: year.end, daysToReset: year.daysToReset },
      annualMaxCents: max,
      usedCents: st.annualUsed,
      remainingCents: max == null ? null : Math.max(0, max - st.annualUsed),
      deductibleCents: ded?.individualCents ?? null,
      deductibleMetCents: Math.min(st.deductibleMet, ded?.individualCents ?? st.deductibleMet),
      orthoLifetime: orthoEligible ? { maxCents: orthoMax, usedCents: st.orthoUsed } : null,
      frequency,
    };
  });
}

const findProc = (procedures: Procedure[], code: string) => {
  const p = procedures.find((x) => x.code === code);
  if (!p) throw new Error(`Unknown procedure ${code}`);
  return p;
};

export function runEstimate(ctx: HouseholdCtx, req: EstimateRequest): Estimate {
  const { plan, members, procedures } = ctx;
  const member = members.find((m) => m.id === req.memberId);
  const tier = plan.tiers.find((t) => t.id === req.tierId);
  if (!member || !tier) throw new Error('Unknown member or network option');
  const { states, familyDeductibleMet } = deriveStates({ ...ctx, todayIso: req.date });
  let st = states.get(member.id) ?? emptyState();
  let fam = familyDeductibleMet;
  const items: EstimateItem[] = [];
  const assumptions = new Set<string>();
  for (const it of req.items) {
    const r = estimateItem({ plan, tier, member, todayIso: req.date, proc: findProc(procedures, it.procedureCode), quoteCents: it.quoteCents, allowedCents: it.allowedCents }, st, fam);
    items.push(r.item); r.assumptions.forEach((a) => assumptions.add(a)); st = r.state; fam += r.deductibleApplied;
  }
  const totals = items.reduce((t, i) => ({ billedCents: t.billedCents + i.billedCents, planPaysCents: t.planPaysCents + i.planPaysCents, youPayCents: t.youPayCents + i.youPayCents }), { billedCents: 0, planPaysCents: 0, youPayCents: 0 });
  const max = plan.annualMax.amountCents;
  return { id: crypto.randomUUID(), memberId: member.id, tierId: tier.id, tierLabel: tier.label, date: req.date, items, totals, remainingAnnualMaxAfterCents: max == null ? null : Math.max(0, max - st.annualUsed), assumptions: [...assumptions], computedAt: new Date().toISOString() };
}

export function runSequence(ctx: HouseholdCtx, req: SequenceRequest): Sequence {
  const { plan, members, procedures, todayIso } = ctx;
  const member = members.find((m) => m.id === req.memberId);
  const tier = plan.tiers.find((t) => t.id === req.tierId);
  if (!member || !tier) throw new Error('Unknown member or network option');
  const year = planYearOf(plan, todayIso);
  const { states, familyDeductibleMet } = deriveStates(ctx);
  const start = states.get(member.id) ?? emptyState();
  const n = req.items.length;
  const assumptions = new Set<string>(['Assumes your plan stays the same next plan year.']);

  const evaluate = (mask: number) => {
    const steps: SequenceStep[] = [];
    let st = { ...start };
    let fam = familyDeductibleMet;
    const order = [...req.items.keys()].sort((a, b) => ((mask >> a) & 1) - ((mask >> b) & 1) || a - b);
    let switched = false;
    for (const i of order) {
      const deferred = ((mask >> i) & 1) === 1;
      if (deferred && !switched) { st = { annualUsed: 0, deductibleMet: 0, orthoUsed: st.orthoUsed }; fam = 0; switched = true; }
      const it = req.items[i]!;
      const r = estimateItem({ plan, tier, member, todayIso: deferred ? year.nextStart : todayIso, proc: findProc(procedures, it.procedureCode), quoteCents: it.quoteCents, allowedCents: it.allowedCents }, st, fam);
      r.assumptions.forEach((a) => assumptions.add(a));
      st = r.state; fam += r.deductibleApplied;
      steps.push({ procedureCode: it.procedureCode, label: r.item.label, window: deferred ? 'next_plan_year' : 'this_plan_year', estimate: r.item });
    }
    return { steps, youPayCents: steps.reduce((s, x) => s + x.estimate.youPayCents, 0), deferred: popcount(mask) };
  };

  const allowed = [...Array(1 << n).keys()].filter((mask) => req.items.every((it, i) => it.canWait || ((mask >> i) & 1) === 0));
  const baseline = evaluate(0);
  let best = baseline;
  for (const mask of allowed) {
    const c = evaluate(mask);
    if (c.youPayCents < best.youPayCents || (c.youPayCents === best.youPayCents && c.deferred < best.deferred)) best = c;
  }
  const difference = baseline.youPayCents - best.youPayCents;
  const reasons: string[] = [];
  const deferredLabels = best.steps.filter((s) => s.window === 'next_plan_year').map((s) => s.label);
  const maxLeft = plan.annualMax.amountCents == null ? null : Math.max(0, plan.annualMax.amountCents - start.annualUsed);
  if (difference > 0) {
    reasons.push(`${deferredLabels.join(' and ')} ${deferredLabels.length === 1 ? 'moves' : 'move'} to the next plan year, when your annual maximum and deductible start fresh.`);
    if (maxLeft != null) reasons.push(`This plan year you have ${money(maxLeft)} of your annual maximum left, and doing everything now would use more than that.`);
  } else if (req.items.every((i) => !i.canWait)) {
    reasons.push('Nothing here can wait, so everything is scheduled in this plan year.');
  } else if (req.items.every((i) => procedures.find((p) => p.code === i.procedureCode)?.coverageClass === 'ortho')) {
    reasons.push('Orthodontics has its own lifetime maximum, which doesn’t reset when the plan year does, so the timing doesn’t change what you pay.');
  } else if (plan.annualMax.amountCents == null) {
    reasons.push('Your plan has no annual maximum, so splitting care across plan years doesn’t help.');
  } else {
    reasons.push('Your annual maximum isn’t used up by this care, so doing it all this plan year costs the same.');
  }
  return { planYearEnds: year.end, baseline: { steps: baseline.steps, youPayCents: baseline.youPayCents }, best: { steps: best.steps, youPayCents: best.youPayCents }, differenceCents: difference, reasons, assumptions: [...assumptions], candidatesTried: allowed.length };
}

const popcount = (n: number) => { let c = 0; while (n) { c += n & 1; n >>= 1; } return c; };
