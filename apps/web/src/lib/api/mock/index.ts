import { planFixtures, type Message, type Reminder, type Snapshot, type Turn } from '@floss/contracts';
import type { AuthUser } from '@/lib/authStore';
import { dayAfter, formatDate, money } from '@/lib/format';
import { FlossApiError, type FlossApi } from '../FlossApi';
import { respond } from './chat';
import { deriveUsage, estimateItem, iso, parseIso, planYearOf, deriveStates, type HouseholdCtx } from './engine';
import { flossNumber, MockStore, todayIso, uid } from './store';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const msg = (m: Partial<Message> & Pick<Message, 'role' | 'text'>): Message => ({ id: uid(), channel: 'app', cards: [], createdAt: new Date().toISOString(), ...m });

export function createMockApi(getUser: () => AuthUser | null): FlossApi {
  let s = new MockStore();
  const ctx = (): HouseholdCtx => ({ plan: s.plan, members: s.members, procedures: s.procedures, visits: s.visits, todayIso: todayIso() });

  const reminders = (): Reminder[] => {
    if (!s.preferences.remindersOptIn || s.plan.annualMax.amountCents == null) return [];
    const c = ctx();
    const year = planYearOf(s.plan, c.todayIso);
    const usage = deriveUsage(c);
    const withLeft = usage.filter((u) => (u.remainingCents ?? 0) > 0);
    if (withLeft.length === 0) return [];
    return [...s.preferences.reminderDaysBefore].sort((a, b) => b - a).map((days) => {
      const sendOn = iso(new Date(parseIso(year.end).getTime() - days * 86_400_000));
      return {
        id: `rem-${days}`, kind: 'benefits_expiring' as const, memberId: null, sendOn,
        status: sendOn <= c.todayIso ? ('sent' as const) : ('scheduled' as const),
        title: `${days} days before your plan year ends`,
        body: `Your plan year ends ${formatDate(year.end, { month: 'long', day: 'numeric' })} and your annual maximum starts over on ${formatDate(dayAfter(year.end), { month: 'long', day: 'numeric' })}. ${withLeft.map((u) => `${s.members.find((m) => m.id === u.memberId)!.firstName} still has ${money(u.remainingCents)} available`).join(', ')}.`,
      };
    });
  };

  const turnReply = (text: string) => {
    const r = respond(ctx(), text);
    const reply = msg({ role: 'assistant', text: r.text, cards: r.cards });
    if (r.pending) {
      const action = { ...r.pending.action, id: uid() };
      s.pending.push({ action, payload: r.pending.payload });
      reply.cards = [...reply.cards, { type: 'pending_action', action }];
    }
    return reply;
  };

  const api: FlossApi = {
    mode: 'mock',
    async getSnapshot() {
      await wait(120);
      const c = ctx();
      const u = getUser() ?? { id: 'user-1', name: 'Jordan', email: 'jordan@example.com' };
      const snap: Snapshot = {
        revision: s.revision, serverTime: new Date().toISOString(), user: u,
        household: { id: 'hh-1', name: s.householdMode === 'solo' ? s.members[0]!.firstName : `${s.members[0]!.firstName}’s family`, members: s.members },
        plan: s.plan, usage: deriveUsage(c), visits: s.visits.slice(0, 20), reminders: reminders(), preferences: s.preferences,
        messages: s.messages.slice(-50), pendingActions: s.pending.filter((p) => p.action.status === 'pending').map((p) => p.action),
        messaging: s.messaging, ai: { status: 'available' },
      };
      return structuredClone(snap);
    },
    async sendTurn(text) {
      const trimmed = text.trim();
      if (!trimmed) throw new FlossApiError('invalid_request', 'Type a message first.', false, 400);
      s.messages.push(msg({ role: 'user', text: trimmed }));
      const turn: Turn = { id: uid(), status: 'queued' };
      s.turns.set(turn.id, turn); s.bump();
      setTimeout(() => { turn.status = 'working'; }, 250);
      setTimeout(() => { const reply = turnReply(trimmed); s.messages.push(reply); s.turns.set(turn.id, { id: turn.id, status: 'completed', reply }); s.bump(); }, 1100);
      return { turnId: turn.id };
    },
    async getTurn(id) {
      const t = s.turns.get(id);
      if (!t) throw new FlossApiError('not_found', 'That request is no longer available.', false, 404);
      return structuredClone(t);
    },
    async listConversations() {
      const first = s.messages.find((m) => m.role === 'user');
      const last = s.messages[s.messages.length - 1];
      return first && last ? [{ id: 'mock-thread', channel: 'app' as const, title: first.text.slice(0, 60), updatedAt: last.createdAt, messageCount: s.messages.length }] : [];
    },
    async listMessages({ limit = 50 } = {}) { return { messages: structuredClone(s.messages.slice(-limit)), nextCursor: null }; },
    async confirmAction(id) {
      await wait(250);
      const p = s.pending.find((x) => x.action.id === id);
      if (!p || p.action.status !== 'pending') throw new FlossApiError('conflict', 'That action was already handled.', false, 409);
      if (p.payload.type === 'record_visit') {
        const { memberId, procedureCode, quoteCents, date } = p.payload;
        const c = ctx();
        const member = s.members.find((m) => m.id === memberId)!;
        const tier = s.plan.tiers.find((t) => t.kind !== 'out_of_network') ?? s.plan.tiers[0]!;
        const { states, familyDeductibleMet } = deriveStates(c);
        const proc = s.procedures.find((x) => x.code === procedureCode)!;
        const r = estimateItem({ plan: s.plan, tier, member, todayIso: date, proc, quoteCents }, states.get(memberId)!, familyDeductibleMet);
        s.visits.unshift({ id: uid(), memberId, date, procedureCode, label: proc.plainName, billedCents: quoteCents, planPaidCents: r.item.planPaysCents, youPaidCents: r.item.youPayCents, deductibleAppliedCents: r.deductibleApplied, source: 'app' });
        s.messages.push(msg({ role: 'assistant', text: `Saved. ${member.firstName}’s ${proc.plainName.toLowerCase()} is on your dashboard.` }));
      } else {
        s.messages.push(msg({ role: 'system', channel: 'email', text: `Transcript emailed to ${(getUser() ?? { email: 'jordan@example.com' }).email}.`, delivery: { status: 'simulated', at: new Date().toISOString() } }));
      }
      p.action.status = 'applied'; s.bump();
    },
    async cancelAction(id) {
      const p = s.pending.find((x) => x.action.id === id);
      if (p && p.action.status === 'pending') { p.action.status = 'cancelled'; s.bump(); }
    },
    async createLinkCode() {
      await wait(250);
      s.linkCode = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
      s.messaging = { ...s.messaging, status: 'awaiting_text' }; s.bump();
      return { code: s.linkCode, flossNumber, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() };
    },
    async unlinkPhone() { s.messaging = { status: 'unlinked', flossNumber, mode: 'simulated' }; s.linkCode = null; s.bump(); },
    async updatePreferences(p) { s.preferences = structuredClone(p); s.bump(); },
    async requestTranscript() {
      await wait(500);
      const email = (getUser() ?? { email: 'jordan@example.com' }).email;
      s.messages.push(msg({ role: 'system', channel: 'email', text: `Transcript emailed to ${email}.`, delivery: { status: 'simulated', at: new Date().toISOString() } }));
      s.bump();
      return { sentTo: email };
    },
    dev: {
      plans: Object.entries(planFixtures).map(([key, p]) => ({ key, label: `${p.carrier}: ${p.name}` })),
      currentPlanKey: () => s.planKey,
      setPlan(key) { if (planFixtures[key]) { s.planKey = key; s.seed(); } },
      currentHousehold: () => s.householdMode,
      setHousehold(mode) { s.householdMode = mode; s.seed(); },
      simulateText() {
        if (s.messaging.status !== 'awaiting_text' || !s.linkCode) return;
        const t = new Date().toISOString();
        s.messages.push(msg({ role: 'user', channel: 'sms', text: `JOIN ${s.linkCode}`, createdAt: t }));
        s.messages.push(msg({ role: 'assistant', channel: 'sms', text: `You’re connected, ${(getUser()?.name ?? 'Jordan').split(' ')[0]}. Ask me anything about your dental plan. Reply STOP anytime.`, delivery: { status: 'simulated', at: t } }));
        s.messaging = { ...s.messaging, status: 'linked', maskedPhone: '+1 ••• ••• 4567' }; s.bump();
      },
      reset() { s = new MockStore(); },
      setMembers(members) { if (JSON.stringify(s.membersOverride) !== JSON.stringify(members)) { s.membersOverride = members; s.seed(); } },
    },
  };
  return api;
}
