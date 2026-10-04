import { describe, expect, it } from 'vitest';
import { PlanSummary, planFixtures, procedureCatalog, resolveProcedures } from './index';

describe('plan fixtures', () => {
  for (const [key, plan] of Object.entries(planFixtures)) {
    it(`${key} parses and is internally consistent`, () => {
      expect(() => PlanSummary.parse(plan)).not.toThrow();
      const tierIds = new Set(plan.tiers.map((t) => t.id));
      for (const r of plan.classRules) expect(tierIds.has(r.tierId)).toBe(true);
      for (const d of plan.deductibles) expect(tierIds.has(d.tierId)).toBe(true);
      // every tier has a rule for every class
      for (const t of plan.tiers) for (const c of ['preventive', 'basic', 'major', 'ortho'] as const) expect(plan.classRules.some((r) => r.tierId === t.id && r.class === c)).toBe(true);
    });
  }
  it('matches the numbers printed in the Lincoln summary', () => {
    const l = planFixtures.lincoln!;
    const rate = (c: string) => l.classRules.find((r) => r.class === c)!.insurerRateBps;
    expect([rate('preventive'), rate('basic'), rate('major'), rate('ortho')]).toEqual([10000, 8000, 5000, 5000]);
    expect(l.annualMax.amountCents).toBe(150000);
    expect(l.deductibles[0]).toMatchObject({ individualCents: 2500, familyCents: 7500 });
    expect(l.orthoMax).toMatchObject({ type: 'lifetime', childCents: 150000 });
  });
  it('reclasses MetLife root canals as major', () => {
    const procs = resolveProcedures(planFixtures['metlife-standard']!);
    expect(procs.find((p) => p.code === 'D3330')!.coverageClass).toBe('major');
    expect(resolveProcedures(planFixtures.lincoln!).find((p) => p.code === 'D3330')!.coverageClass).toBe('basic');
  });
  it('has unique procedure codes', () => {
    expect(new Set(procedureCatalog.map((p) => p.code)).size).toBe(procedureCatalog.length);
  });
});
