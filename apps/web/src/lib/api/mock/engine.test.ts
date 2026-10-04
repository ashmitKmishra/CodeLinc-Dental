import { describe, expect, it } from 'vitest';
import { planFixtures, resolveProcedures, type Member, type Visit } from '@floss/contracts';
import { deriveUsage, runEstimate, runSequence, type HouseholdCtx } from './engine';

const TODAY = '2026-10-03';
const members: Member[] = [
  { id: 'jordan', firstName: 'Jordan', relationship: 'self', birthDate: '1988-04-12' },
  { id: 'maya', firstName: 'Maya', relationship: 'child', birthDate: '2012-06-18' },
];
const ctxFor = (planKey: string, visits: Visit[] = []): HouseholdCtx => {
  const plan = planFixtures[planKey]!;
  return { plan, members, procedures: resolveProcedures(plan), visits, todayIso: TODAY };
};
const visit = (memberId: string, planPaidCents: number, code = 'D2740'): Visit => ({ id: 'v', memberId, date: '2026-03-01', procedureCode: code, label: 'x', billedCents: planPaidCents, planPaidCents, youPaidCents: 0, deductibleAppliedCents: 0, source: 'app' });
const est = (planKey: string, memberId: string, tierId: string, code: string, quoteCents: number, visits: Visit[] = [], allowedCents?: number) =>
  runEstimate(ctxFor(planKey, visits), { memberId, tierId, date: TODAY, items: [{ procedureCode: code, quoteCents, allowedCents }] }).items[0]!;

describe('Lincoln summary of benefits (100/80/50, $25 deductible, $1,500 max)', () => {
  it('crown $1,200: $25 deductible, then 50% of $1,175', () => {
    const i = est('lincoln', 'jordan', 'any', 'D2740', 120000);
    expect(i).toMatchObject({ status: 'covered', deductibleAppliedCents: 2500, planPaysCents: 58750, youPayCents: 61250 });
  });
  it('cleaning is paid in full with no deductible', () => {
    expect(est('lincoln', 'jordan', 'any', 'D1110', 12000)).toMatchObject({ deductibleAppliedCents: 0, planPaysCents: 12000, youPayCents: 0 });
  });
  it('caps what the plan pays at what is left of the annual maximum', () => {
    const i = est('lincoln', 'jordan', 'any', 'D2740', 120000, [visit('jordan', 145000)]);
    expect(i.planPaysCents).toBe(5000); // $1,500 − $1,450 left
    expect(i.youPayCents).toBe(115000);
    expect(i.lines.some((l) => l.step === 'annual_max')).toBe(true);
  });
  it('orthodontics: covered for a child up to the $1,500 lifetime maximum, not for an adult', () => {
    expect(est('lincoln', 'maya', 'any', 'D8080', 400000)).toMatchObject({ status: 'covered', planPaysCents: 150000, youPayCents: 250000 });
    expect(est('lincoln', 'jordan', 'any', 'D8080', 400000)).toMatchObject({ status: 'not_covered', planPaysCents: 0, youPayCents: 400000 });
  });
  it('orthodontics does not touch the annual maximum', () => {
    const u = deriveUsage(ctxFor('lincoln', [visit('maya', 100000, 'D8080')])).find((x) => x.memberId === 'maya')!;
    expect(u.usedCents).toBe(0);
    expect(u.orthoLifetime).toMatchObject({ maxCents: 150000, usedCents: 100000 });
  });
});

describe('other carriers', () => {
  it('Cigna does not cover orthodontics', () => {
    expect(est('cigna', 'maya', 'in', 'D8080', 400000).status).toBe('not_covered');
  });
  it('Cigna applies its $100 deductible even to preventive care', () => {
    expect(est('cigna', 'jordan', 'in', 'D1110', 12000)).toMatchObject({ deductibleAppliedCents: 10000, planPaysCents: 2000 });
  });
  it('Aetna pays 80% for major care', () => {
    expect(est('aetna', 'jordan', 'in', 'D2740', 120000)).toMatchObject({ deductibleAppliedCents: 5000, planPaysCents: 92000 });
  });
  it('MetLife treats root canals as major, and in-network has no deductible', () => {
    expect(est('metlife-standard', 'jordan', 'in', 'D3330', 100000)).toMatchObject({ coverageClass: 'major', deductibleAppliedCents: 0, planPaysCents: 35000 });
  });
  it('MetLife High has no annual maximum', () => {
    expect(deriveUsage(ctxFor('metlife-high'))[0]).toMatchObject({ annualMaxCents: null, remainingCents: null });
  });
  it('out of network, the dentist can bill above the allowed amount', () => {
    const i = est('delta', 'jordan', 'nonpar', 'D2392', 20000, [], 15000);
    expect(i.balanceBillCents).toBe(5000);
    expect(i.youPayCents).toBe(20000 - i.planPaysCents);
  });
  it('in network, anything above the allowed amount is written off', () => {
    const i = est('delta', 'jordan', 'ppo', 'D2392', 20000, [], 15000);
    expect(i.balanceBillCents).toBe(0);
    expect(i.youPayCents).toBe(15000 - i.planPaysCents);
  });
});

describe('sequence across the plan year', () => {
  it('moves care that can wait into the new plan year when this year’s maximum runs short', () => {
    const c = ctxFor('lincoln', [visit('jordan', 140000)]);
    const s = runSequence(c, { memberId: 'jordan', tierId: 'any', items: [{ procedureCode: 'D2740', quoteCents: 120000, canWait: true }] });
    expect(s.differenceCents).toBeGreaterThan(0);
    expect(s.best.steps[0]!.window).toBe('next_plan_year');
  });
  it('never moves care that cannot wait', () => {
    const c = ctxFor('lincoln', [visit('jordan', 140000)]);
    const s = runSequence(c, { memberId: 'jordan', tierId: 'any', items: [{ procedureCode: 'D2740', quoteCents: 120000, canWait: false }] });
    expect(s.differenceCents).toBe(0);
    expect(s.best.steps[0]!.window).toBe('this_plan_year');
  });
  it('is honest when timing does not matter (orthodontics has a lifetime maximum)', () => {
    const s = runSequence(ctxFor('lincoln'), { memberId: 'maya', tierId: 'any', items: [{ procedureCode: 'D8080', quoteCents: 300000, canWait: true }] });
    expect(s.differenceCents).toBe(0);
    expect(s.reasons.join(' ')).toMatch(/lifetime maximum/);
  });
});
