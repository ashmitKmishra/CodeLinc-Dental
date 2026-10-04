import type { Card, Member, PendingAction } from '@floss/contracts';
import { ageOn, dayAfter, formatDate, money, parseDollars, pct } from '@/lib/format';
import { deriveUsage, runEstimate, type HouseholdCtx } from './engine';
import type { PendingPayload } from './store';

/**
 * MOCK ONLY. Rule-based stand-in for the AI agent. It never makes up a price: it asks for the dentist's quote,
 * and every number in a reply comes from the stand-in calculator or the plan data. The real agent is the backend's job.
 */
export interface Reply { text: string; cards: Card[]; pending?: { action: Omit<PendingAction, 'id'>; payload: PendingPayload } }

const procedureWords: [RegExp, string][] = [
  [/root canal/i, 'D3330'], [/crown|cap\b/i, 'D2740'], [/two.surface|2.surface/i, 'D2392'], [/filling|cavity/i, 'D2391'],
  [/deep clean|scaling|root planing/i, 'D4341'], [/wisdom|impacted/i, 'D7240'], [/extract|pulled/i, 'D7140'], [/braces|ortho|invisalign/i, 'D8080'],
  [/bridge/i, 'D6240'], [/denture/i, 'D5110'], [/fluoride/i, 'D1206'], [/sealant/i, 'D1351'], [/full.mouth/i, 'D0210'], [/x-?ray|bitewing/i, 'D0274'],
  [/clean/i, 'D1110'], [/exam|check.?up/i, 'D0120'],
];

function findMember(text: string, members: Member[]): Member {
  return members.find((m) => new RegExp(`\\b${m.firstName}\\b`, 'i').test(text)) ?? members.find((m) => m.relationship === 'self') ?? members[0]!;
}
function findQuote(text: string): number | null {
  const m = text.match(/\$\s?([\d,]+(?:\.\d{1,2})?)/) ?? text.match(/(?:quote[d]?|charg(?:e|ed|es)|bill(?:ed)?|cost(?:s|ing)?|pay(?:ing)?)\D{0,18}?([\d,]{2,}(?:\.\d{1,2})?)/i);
  return m ? parseDollars(m[1]!) : null;
}

export function respond(ctx: HouseholdCtx, text: string): Reply {
  const { plan, members, procedures, todayIso } = ctx;
  const member = findMember(text, members);
  const tier = plan.tiers.find((t) => t.kind !== 'out_of_network') ?? plan.tiers[0]!;
  const wordHit = procedureWords.find(([re]) => re.test(text));
  let code = wordHit?.[1];
  if (code === 'D1110' && ageOn(member.birthDate, todayIso) < 14) code = 'D1120';
  const proc = code ? procedures.find((p) => p.code === code) : undefined;
  const quote = findQuote(text);
  const usage = deriveUsage(ctx);
  const u = usage.find((x) => x.memberId === member.id)!;

  if (/transcript|email me|send me (a |the )?(copy|chat)/i.test(text)) {
    return { text: 'I can email you a transcript of this conversation. Want me to send it?', cards: [], pending: { action: { type: 'email_transcript', previewText: 'Email a transcript of this chat to your inbox.', confirmToken: token(), status: 'pending', expiresAt: soon() }, payload: { type: 'email_transcript' } } };
  }

  if (proc && /\b(had|got|got my|finished|did|went|completed)\b/i.test(text) && !/\b(need|needs|recommend|going to|will|planned|should|might)\b/i.test(text)) {
    if (quote == null) return { text: `Got it. How much did the dentist bill for ${member.firstName}’s ${proc.plainName.toLowerCase()}? I’ll work out what your plan paid and update your annual maximum.`, cards: [] };
    const est = runEstimate(ctx, { memberId: member.id, tierId: tier.id, date: todayIso, items: [{ procedureCode: proc.code, quoteCents: quote }] });
    const it = est.items[0]!;
    return {
      text: `That would be ${member.firstName}’s ${proc.plainName.toLowerCase()} on ${formatDate(todayIso)}: your plan pays ${money(it.planPaysCents)} and you pay ${money(it.youPayCents)}. Confirm and I’ll add it to your annual maximum.`,
      cards: [{ type: 'estimate', estimate: est }],
      pending: { action: { type: 'record_visit', previewText: `Record ${member.firstName}’s ${proc.plainName.toLowerCase()} (${money(quote)}) on ${formatDate(todayIso)}.`, confirmToken: token(), status: 'pending', expiresAt: soon() }, payload: { type: 'record_visit', memberId: member.id, procedureCode: proc.code, quoteCents: quote, date: todayIso } },
    };
  }

  if (proc) {
    if (quote == null) {
      const rule = plan.classRules.find((r) => r.class === proc.coverageClass && r.tierId === tier.id);
      const how = rule?.insurerRateBps == null ? `Your plan doesn’t cover ${proc.coverageClass === 'ortho' ? 'orthodontics' : 'this'}.` : `${proc.plainName} counts as ${proc.coverageClass} care on your plan, and the plan pays ${pct(rule.insurerRateBps)} of the allowed amount${rule.deductibleApplies ? ' after your deductible' : ''}.`;
      return { text: `${how} What did your dentist quote for ${member.firstName}? I’ll use it to work out exactly what you’d owe.`, cards: [] };
    }
    const est = runEstimate(ctx, { memberId: member.id, tierId: tier.id, date: todayIso, items: [{ procedureCode: proc.code, quoteCents: quote }] });
    const it = est.items[0]!;
    const body = it.status === 'not_covered' ? `${it.notCoveredReason} You’d pay the full ${money(quote)}.` : `For ${member.firstName}’s ${proc.plainName.toLowerCase()}, your plan pays ${money(it.planPaysCents)} and you’d pay ${money(it.youPayCents)}. The breakdown below shows why.`;
    return { text: body, cards: [{ type: 'estimate', estimate: est }] };
  }

  if (/(left|remaining|used|how much).*(max|benefit|year|have)|what.?s left|annual max/i.test(text)) {
    const body = u.annualMaxCents == null ? `${member.firstName}’s plan has no annual maximum. Your plan year ends ${formatDate(u.planYear.end)}.` : `${member.firstName} has used ${money(u.usedCents)} of ${money(u.annualMaxCents)} this plan year, so ${money(u.remainingCents)} is left. It resets on ${formatDate(dayAfter(u.planYear.end))}, in ${u.planYear.daysToReset} days.`;
    return { text: body, cards: [{ type: 'usage', memberId: member.id }] };
  }

  if (/deductible/i.test(text)) {
    const d = plan.deductibles.find((x) => x.tierId === tier.id);
    const classes = plan.classRules.filter((r) => r.tierId === tier.id && r.deductibleApplies).map((r) => r.class);
    return { text: d?.individualCents == null ? 'Your plan summary doesn’t state a deductible.' : `A deductible is what you pay yourself before the plan starts paying. On your plan it’s ${money(d.individualCents)} per person${d.familyCents ? ` (${money(d.familyCents)} for a family)` : ''}, and it applies to ${classes.length ? classes.join(' and ') : 'no care'} services.`, cards: [] };
  }
  if (/maximum|limit/i.test(text)) {
    const m = plan.annualMax.amountCents;
    return { text: m == null ? 'Your plan has no annual maximum for regular care.' : `Your annual maximum is ${money(m)} per person. It’s the most the plan pays in a plan year for preventive, basic and major care. It resets on ${formatDate(dayAfter(u.planYear.end))}.${plan.orthoMax.type === 'lifetime' ? ` Orthodontics has its own lifetime maximum.` : ''}`, cards: [] };
  }
  if (/waiting/i.test(text)) {
    const w = plan.waitingPeriods;
    return { text: w.length === 0 ? 'Your plan summary doesn’t list any waiting periods.' : w.every((x) => x.months === 0) ? 'Your plan has no waiting periods, so coverage starts right away.' : `Waiting periods: ${w.map((x) => `${x.class} ${x.months} months`).join(', ')}.`, cards: [] };
  }

  return { text: 'I can tell you what a procedure will cost with your plan, what’s covered, and how much of your annual maximum is left. Try asking about a procedure, like a crown or a filling.', cards: [] };
}

const token = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
const soon = () => new Date(Date.now() + 24 * 3_600_000).toISOString();
