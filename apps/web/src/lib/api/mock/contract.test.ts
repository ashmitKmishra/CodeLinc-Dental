import { describe, expect, it } from 'vitest';
import { Message, PlanSummary, Snapshot, Turn } from '@floss/contracts';
import { createMockApi } from './index';

const user = { id: 'u1', name: 'Jordan', email: 'jordan@example.com' };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Whatever the mock returns must satisfy the same schemas the live adapter validates against. */
describe('mock adapter matches the shared contract', () => {
  const api = createMockApi(() => user);
  for (const { key } of api.dev!.plans) {
    it(`${key}: snapshot parses for the family and for one person`, async () => {
      api.dev!.setPlan(key);
      for (const mode of ['family', 'solo'] as const) {
        api.dev!.setHousehold(mode);
        const snap = Snapshot.parse(await api.getSnapshot());
        expect(() => PlanSummary.parse(snap.plan)).not.toThrow();
        expect(snap.household.members.length).toBe(mode === 'solo' ? 1 : 4);
        expect(snap.usage.length).toBe(snap.household.members.length);
      }
      api.dev!.setHousehold('family');
    });
  }

  it('a chat turn completes and its reply parses; a recorded visit changes usage', async () => {
    api.dev!.setPlan('lincoln');
    const before = (await api.getSnapshot()).usage.find((u) => u.memberId === 'm-leo')!.usedCents;
    const { turnId } = await api.sendTurn('Leo had a filling, the bill was $180');
    await wait(1300);
    const turn = Turn.parse(await api.getTurn(turnId));
    expect(turn.status).toBe('completed');
    const snap = Snapshot.parse(await api.getSnapshot());
    const action = snap.pendingActions[0]!;
    expect(action.type).toBe('record_visit');
    await api.confirmAction(action.id);
    const after = (await api.getSnapshot()).usage.find((u) => u.memberId === 'm-leo')!.usedCents;
    expect(after).toBeGreaterThan(before);
    const { messages } = await api.listMessages();
    messages.forEach((m) => Message.parse(m));
  });

  it('never invents a price: a procedure question without a quote asks for the quote', async () => {
    api.dev!.setPlan('lincoln');
    const { turnId } = await api.sendTurn('What will a crown cost me?');
    await wait(1300);
    const t = await api.getTurn(turnId);
    expect(t.reply?.text).toMatch(/What did your dentist quote/);
    expect(t.reply?.cards).toEqual([]);
  });
});
