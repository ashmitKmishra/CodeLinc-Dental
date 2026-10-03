# Floss — backend guide (stack-agnostic)

Read `md-files/CONTEXT.md` first. This file defines the **structure** every backend implementation must keep so the web app integrates without rework.

- **Languages, frameworks, databases and clouds may change.** §13 lists the default stack.
- **What must not change without A + B + C agreeing:** the HTTP contract (§4), the snapshot/revision sync model (§5), the pending-action flow (§6), and the engine-as-only-calculator rule (§7).

| Section | Owner |
| --- | --- |
| §1–6, §12–14 (API, data, auth, deploy) | B |
| §7–8 (engine, agent) | C |
| §9–11 (Twilio SMS, email, scheduled jobs) | D |

---

## 1. Non-negotiable principles

1. **One contract.** The client depends only on `/v1` JSON shapes in §4. It never sees database schemas, model names or provider SDKs.
2. **One brain for numbers.** All money math goes through the deterministic engine (§7). The LLM explains; it never computes. Cards are built from engine output, not model text.
3. **One write path.** Every mutation runs through a command handler that validates, writes atomically and increments the household `revision`. App, SMS, email webhooks and scheduled jobs all use the same handlers.
4. **Confirm before writing.** Writes proposed by the agent become `PendingAction`s. Only `POST /v1/actions/{id}/confirm` (app) or `CONFIRM <token>` (SMS) applies them. Exception: `remember_fact` saves directly, is visible, and is deletable.
5. **Identity comes from verified sources.** In the app it comes from the JWT; for SMS, from the linked phone number of a Twilio-signed webhook; for email, from the thread token in the reply address. The server never trusts a `userId` from a body, from the model or from message text.
6. **Idempotent and honest.** Every mutation accepts an `Idempotency-Key`. Deliveries record what actually happened (`queued`, `sent`, `delivered`, `failed`, `unknown`), never assumed success.

## 2. Domain model

All records belong to one `householdId`. Money is **integer cents**; rates are **basis points** (8000 = 80%); dates are ISO `YYYY-MM-DD`; timestamps are ISO UTC.

| Entity | Key fields |
| --- | --- |
| `Household` | id, name, ownerUserId, timezone, email, `revision` |
| `Member` | id, householdId, firstName, relationship (`self`, `spouse`, `child`, `other`), birthDate, colorIndex (0–3, for the UI) |
| `Plan` | id, name, `isSynthetic`, planYearStartMonthDay, perPersonAnnualMaxCents, perPersonDeductibleCents, familyDeductibleCapCents, classes (§2a), frequencyRules, waitingPeriods, `orthoMaxType` (`annual` or `lifetime`), orthoAgeLimit, unknownFields[] |
| `UsageBaseline` | memberId, planYearId, priorUsedCents, priorDeductibleMetCents, priorFrequency {group: count}, asOf — what the user entered at setup |
| `Visit` (event) | id, memberId, date, procedureCode, providerId, billedCents, insurerPaidCents?, deductibleAppliedCents?, patientPaidCents?, evidence (`self_reported`, `confirmed`), source (`app`, `sms`, `email`), reversesVisitId? |
| `Provider` | id, householdId, name, practiceName, specialty, phone, email, `networkStatus` (`in`, `out`, `unknown`), `lastVerifiedAt`, `verificationSource` |
| `ProviderVerification` (event) | providerId, checkedAt, result, previousStatus, source, changed |
| `Quote` | id, memberId, providerId, procedureCode, billedCents, allowedCents?, network, source (`user`, `office_email`, `synthetic`), validUntil? |
| `CareItem` | id, memberId, procedureCode, label, providerId?, quoteId?, dependsOn[], earliestDate, latestDate, `deferralApproved` (bool), scheduledWindow (`current_year`, `next_year`), plannedDate?, status (`proposed`, `requested`, `scheduled`, `done`, `cancelled`), lastEstimate (Estimate) |
| `Message` | id, householdId, threadId, role (`user`, `assistant`, `system`, `office`), channel (`app`, `sms`, `email`), memberIds[], text, cards[], createdAt, delivery? |
| `Turn` | id, householdId, channel, inputMessageId, status (`queued`, `working`, `completed`, `failed`), replyMessageId?, error? |
| `PendingAction` | id, householdId, type (§6), payload, preview (human text + cards), `confirmToken` (4 chars, for SMS), status (`pending`, `applied`, `expired`, `cancelled`), expiresAt, baseRevision |
| `Notification` | id, householdId, memberId?, kind, title, body, dedupeKey, createdAt, readAt?, delivery {channel, status} |
| `Memory` | id, householdId, memberId?, fact, sourceMessageId, createdAt, deletedAt? |
| `OutreachThread` | id, householdId, providerId, careItemIds[], status (`draft`, `awaiting_approval`, `sent`, `follow_up_scheduled`, `replied`, `closed`), messages (Message refs), nextFollowUpAt?, followUpsSent, replyToken, summary? |
| `SenderLink` | phoneE164, householdId, status (`awaiting_text`, `awaiting_confirmation`, `linked`, `opted_out`), joinCode, joinCodeExpiresAt |
| `Preferences` | householdId, remindersOptIn, smsOptIn, quietHours {start, end}, maxProactivePerDay (1) |
| `IdempotencyRecord` | key, scope, requestHash, response, createdAt |

### 2a. Plan class rule

```ts
type CoverageClass = 'preventive' | 'basic' | 'major' | 'ortho';
interface ClassRule {
  insurerRateBps: number;            // 8000 = plan pays 80%
  deductibleApplies: boolean;
  countsTowardAnnualMax: boolean;
}
```

## 3. Conventions

- Prefix all routes `/v1`. JSON only. `camelCase` fields.
- Money is `…Cents: number` (integer). The client formats it.
- Headers:
    - `Authorization: Bearer <JWT>` on user routes.
    - `Idempotency-Key: <uuid>` on every POST/PUT/DELETE.
    - `If-Match-Revision: <n>` on plan/household edits.
- **Errors** always use one shape:

```ts
{ error: { code: string; message: string; retryable: boolean; requestId: string; fields?: Record<string, string> } }
```

| Status | Meaning |
| --- | --- |
| 400 | invalid |
| 401 | unauthenticated |
| 403 | forbidden |
| 404 | not found (including another household's resource) |
| 409 | stale revision or reused idempotency key with a different body |
| 429 | throttled |
| 503 | a dependency (LLM, Twilio, email) is unavailable |

## 4. API contract

### 4.1 Endpoints

| Method + path | Purpose | Auth |
| --- | --- | --- |
| `GET /health` | Version, build, readiness (no user data) | public |
| `GET /v1/snapshot` | Everything the UI renders (§5) | JWT |
| `PUT /v1/household` | Create or replace household, members, plan, baselines (setup) | JWT |
| `POST /v1/demo/reset` | Load the Rivera demo household (synthetic) | JWT, demo user only |
| `POST /v1/estimates` | Pure estimate; never writes usage | JWT |
| `POST /v1/sequences` | Pure schedule comparison | JWT |
| `POST /v1/turns` | Send a chat message; returns `202 {turnId}` | JWT |
| `GET /v1/turns/{id}` | Turn status + reply message | JWT |
| `GET /v1/messages?cursor=&limit=&channel=&memberId=&q=` | Full history, paginated, newest first | JWT |
| `POST /v1/actions` | Create a pending action from the app (e.g. record a visit via a form) | JWT |
| `POST /v1/actions/{id}/confirm` | Apply one pending action | JWT |
| `POST /v1/actions/{id}/cancel` | Cancel it | JWT |
| `GET /v1/providers` · `PUT /v1/providers/{id}` | List / edit providers | JWT |
| `POST /v1/providers/{id}/verify` | Re-verify network status now | JWT |
| `GET /v1/outreach/{id}` | One email thread with messages | JWT |
| `POST /v1/transcripts` | Create the `email_transcript` pending action for a range | JWT |
| `GET /v1/memory` · `DELETE /v1/memory/{id}` | View / forget remembered facts | JWT |
| `POST /v1/messaging/link-code` | Start SMS linking; returns code + number | JWT |
| `POST /v1/messaging/link/confirm` | Confirm the phone that texted the code | JWT |
| `DELETE /v1/messaging/link` | Unlink phone | JWT |
| `PUT /v1/preferences` | Reminders, quiet hours, SMS opt-in | JWT |
| `POST /v1/notifications/{id}/read` | Mark read | JWT |
| `POST /v1/webhooks/twilio/sms` | Inbound SMS (§9) | Twilio signature |
| `POST /v1/webhooks/twilio/status` | SMS delivery status callback | Twilio signature |
| `POST /v1/webhooks/email/inbound` | Inbound office reply (§10) | provider signature + reply token |
| `POST /v1/demo/clock` · `POST /v1/demo/run-jobs` | Set the demo date; run reminders / re-verify / follow-ups now | JWT, demo user only |
| `POST /v1/demo/providers/{id}/network` | Demo toggle for the directory result | JWT, demo user only |

### 4.2 Core types (the client imports these from `packages/contracts`)

```ts
type Network = 'in' | 'out';

interface EstimateRequest {
  memberId: string;
  date: string;
  network: Network;
  providerId?: string;
  items: { procedureCode: string; quoteCents?: number; allowedCents?: number }[];
}

interface EstimateLine {
  step: 'eligibility' | 'fee' | 'deductible' | 'insurer_rate' | 'annual_max' | 'balance_bill' | 'patient';
  amountCents: number;
  ruleRef: string;          // e.g. "plan.classes.ortho.insurerRateBps"
  why: string;              // one plain sentence with real numbers
}

interface EstimateItem {
  procedureCode: string;
  label: string;
  coverageClass: CoverageClass;
  status: 'covered' | 'not_covered' | 'incomplete';
  missing?: string[];       // e.g. ["allowedCents"]
  billedCents: number;
  allowedCents: number;
  deductibleAppliedCents: number;
  insurerPaysCents: number;
  balanceBillCents: number;
  patientPaysCents: number;
  lines: EstimateLine[];
}

interface Estimate {
  id: string;
  memberId: string;
  date: string;
  network: Network;
  providerId?: string;
  items: EstimateItem[];
  totals: { billedCents: number; insurerPaysCents: number; patientPaysCents: number };
  remainingMaxAfterCents: number;
  assumptions: string[];
  isSynthetic: boolean;
  computedAt: string;
  providerVerifiedAt?: string;
}

interface SequenceRequest {
  memberId: string;
  network: Network;
  items: {
    careItemId?: string;
    procedureCode: string;
    quoteCents?: number;
    allowedCents?: number;
    dependsOn?: string[];
    earliestDate: string;
    latestDate: string;
    deferralApproved: boolean;
  }[];
}

interface Sequence {
  baseline: { steps: SequenceStep[]; patientPaysCents: number };
  best: { steps: SequenceStep[]; patientPaysCents: number };
  differenceCents: number;
  reasons: string[];        // why best is cheaper (reset, deductible, cap)
  assumptions: string[];    // e.g. "Same plan in 2027"
  candidatesTried: number;
}

interface SequenceStep {
  procedureCode: string;
  label: string;
  window: 'current_year' | 'next_year';
  suggestedDate: string;
  estimate: EstimateItem;
}

type Card =
  | { type: 'estimate'; estimate: Estimate }
  | { type: 'sequence'; sequence: Sequence }
  | { type: 'network_compare'; inNetwork: Estimate; outOfNetwork: Estimate; differenceCents: number }
  | { type: 'usage'; memberId: string }
  | { type: 'pending_action'; action: PendingAction }
  | { type: 'outreach'; threadId: string }
  | { type: 'provider_change'; providerId: string; beforeCents: number; afterCents: number };

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'office';
  channel: 'app' | 'sms' | 'email';
  memberIds: string[];
  text: string;
  cards: Card[];
  createdAt: string;
  delivery?: { status: 'queued' | 'sent' | 'delivered' | 'failed' | 'unknown' | 'simulated'; at: string };
}

interface PendingAction {
  id: string;
  type: ActionType;
  previewText: string;
  cards: Card[];
  confirmToken: string;
  status: 'pending' | 'applied' | 'expired' | 'cancelled';
  expiresAt: string;
}

type ActionType =
  | 'record_visit' | 'reverse_visit' | 'save_care_plan' | 'send_outreach_email'
  | 'email_transcript' | 'update_preferences' | 'update_provider';
```

## 5. Snapshot and sync

`GET /v1/snapshot` returns everything the dashboard needs in one consistent read:

```ts
interface Snapshot {
  revision: number;                    // increments on every committed write
  serverTime: string;
  demoClock: string | null;            // when set, all "today" logic uses it; UI shows a "Demo date" badge
  household: { id: string; name: string; timezone: string; email: string; members: Member[] } | null;
  plan: Plan | null;
  usage: MemberUsage[];                // one per member, current plan year
  family: { deductibleCapCents: number; deductibleMetCents: number };
  providers: Provider[];
  care: CareItem[];
  visits: Visit[];                     // latest 50
  messages: Message[];                 // latest 50 (full history via /v1/messages)
  pendingActions: PendingAction[];
  notifications: Notification[];
  outreach: OutreachThreadSummary[];
  memory: { count: number };
  messaging: {
    status: 'unlinked' | 'awaiting_text' | 'awaiting_confirmation' | 'linked' | 'opted_out';
    maskedPhone?: string;
    flossNumber: string;               // E.164 Twilio number shown on the link screen
    mode: 'live' | 'simulated';
  };
  ai: { status: 'available' | 'degraded' | 'off' };
}

interface MemberUsage {
  memberId: string;
  planYear: { start: string; end: string; daysToReset: number };
  annualMaxCents: number;
  actualUsedCents: number;             // confirmed + self-reported visits + baseline
  pendingCents: number;                // unconfirmed
  projectedCents: number;              // saved care in this plan year (never part of actual)
  remainingCents: number;              // annualMax - actualUsed
  deductibleCents: number;
  deductibleMetCents: number;
  frequency: { group: string; label: string; used: number; allowed: number; nextEligibleOn?: string }[];
  orthoLifetime?: { maxCents: number; usedCents: number };
}
```

**Sync rules:**

- The client polls the snapshot every 2 s while visible, refetches on focus and after its own mutations, and backs off on errors.
- Reads are strongly consistent. If `revision` changes during assembly, retry, so a response never mixes states.
- A changed `revision` is the client's cue to animate what changed (FRONTEND.md §6).
- Push (WebSockets/AppSync) may replace polling later without changing these shapes.

## 6. Commands, pending actions, idempotency

- **Action types and effects:**

| Type | Effect when applied |
| --- | --- |
| `record_visit` | Visit event + usage change |
| `reverse_visit` | Reversal event |
| `save_care_plan` | CareItems with window/date; projected usage only |
| `send_outreach_email` | Sends the draft; schedules the follow-up |
| `email_transcript` | Sends the transcript for a date range to the household email |
| `update_preferences` | Changes preferences |
| `update_provider` | Changes provider details |

- **Confirm flow:**
    1. Load the action and check it is still `pending` and not expired.
    2. If `household.revision > baseRevision` and the change affects the preview, re-compute and return a **new** preview (409 `stale_preview`) instead of applying old numbers.
    3. Otherwise apply all writes, `revision++`, set `applied` and store the idempotent result — **in one transaction**.
- **SMS confirmations:** `CONFIRM <token>` resolves exactly one pending action for that linked phone. A bare "yes" with exactly one pending action from the last assistant message → ask "Reply CONFIRM K7Q2 to save". Never apply on an ambiguous yes.
- **Idempotency:** store `(key, scope=householdId+route, hash(body))`. The same key and body return the stored response. The same key with a different body returns 409.
- **Turn enqueue:** persist the turn as `queued` first, then enqueue. If enqueue fails, keep the turn `needs_enqueue` and a sweeper re-enqueues it. Never report a queued turn as done.

## 7. Deterministic engine (owner C)

A pure library with no I/O. It is imported by the API, agent tools, jobs and (optionally) the client for instant previews.

**Order per item** (CONTEXT.md §4):

1. **Eligibility:** waiting period, frequency (per plan year or rolling months), age limit (ortho), member's coverage start.
2. **Fees:** billed = quote; allowed = in-network allowed (in network) or plan allowed (out of network). Balance bill = billed − allowed when out of network.
3. **Deductible:** if `deductibleApplies`, take min(member remaining, family cap remaining, allowed).
4. **Insurer share:** (allowed − deductible) × rateBps / 10000, rounded to the cent.
5. **Cap:** if `countsTowardAnnualMax`, insurer pays = min(share, member remaining max). Ortho with `orthoMaxType: 'lifetime'` uses the lifetime remainder instead.
6. **Patient pays** = billed − insurer pays.
7. **Carry state forward** across items in date order. Never touch stored usage.

**Sequencer:**

- Each item may go in `current_year` or `next_year`. Next year is allowed only if `deferralApproved` and `latestDate` reaches past the reset.
- Enumerate all valid combinations (≤ 8 items → ≤ 256) and respect `dependsOn`.
- Next year resets the max, deductible and frequency, under a stated "same plan next year" assumption.
- Pick the lowest patient total; ties go to fewer deferrals.

**Required tests** (cents in code):

| Case | Expected |
| --- | --- |
| Maya, braces upper + lower $2,400 each, in network, both Dec 2026, $1,500 left | insurer $1,500, family **$3,300** |
| Same, deferral approved, sequencer | upper Dec 2026 + lower Jan 2027, family **$2,400**, difference **$900** |
| Same split, provider out of network (allowed $2,000/arch, billed $2,400) | family **$2,800** |
| Leo cleaning, 1 of 2 used | covered, insurer pays allowed, max unchanged (preventive exempt) |
| Leo cleaning, 2 of 2 used | `not_covered` (frequency) |
| Jordan filling $200 + crown $1,200, $300 left, deductible met, same year | patient **$1,100** |
| Same, split filling Dec / crown Jan | patient **$665**, difference **$435** |
| Missing allowed amount out of network | `incomplete`, `missing: ["allowedCents"]` |
| Deferral not approved | the sequencer never moves the item |
| Family deductible cap reached by two members | the third member pays no deductible |
| Ortho, member aged 19, plan limit < 19 | `not_covered` (age) |
| Duplicate `record_visit` confirm | one visit only |

Expose CLI commands (`engine estimate --file req.json`, `engine sequence …`) so anyone can verify numbers without the app.

## 8. Agent (owner C)

`runTurn(context, input) → { replyText, cards, pendingActions, memoryWrites }`. It is callable from a CLI and from the queue worker.

**Context loaded per turn:**

- household, members, plan rules (plain-English versions), usage, providers with `lastVerifiedAt`, open care items, pending actions;
- **memory facts** (all non-deleted);
- the last 20 messages across all channels;
- channel, current date (or demo clock).

**Tools.** Validate every input with a schema; `householdId` is bound by the server, never by the model.

| Tool | Does | Writes |
| --- | --- | --- |
| `get_household_context` | Members, plan rules, usage, providers, care | no |
| `estimate_cost` | Engine estimate | no |
| `compare_network_costs` | Two estimates | no |
| `sequence_care` | Engine sequencer | no |
| `check_provider_network` | Runs re-verification if stale (> 24 h) and returns the status | verification event |
| `draft_outreach_email` | Builds the subject/body from care items, windows and the price-confirmation request | draft only |
| `remember_fact` | Saves a durable fact (no secrets, no SSNs, no health diagnoses) | Memory |
| `prepare_action` | Creates a pending action of an allowed type | PendingAction |

**Limits:**

- 4 model calls and 8 tool calls per turn.
- About 800 output tokens per call; 2,000-character input cap.
- A per-turn deadline and one retry on transient errors.
- Numbers in the final text come from tool results only. Post-check: every `$` in the reply must appear in that turn's tool outputs, otherwise the reply is replaced with the cards plus a safe sentence.

**Curiosity policy (judge 4).** After answering, check for gaps in this order and ask **at most one** question:

1. a missing input that changes the number (quote, network, deferral approval);
2. an unknown provider for the member;
3. an unknown last cleaning date;
4. preferred appointment times before outreach.

Never ask when the user is confirming or ending the conversation.

**Memory policy (judge 1):**

- Remember stable facts: providers, preferences, family details, the user's stated plans. Not health diagnoses, IDs, card numbers or anything the user says is private.
- Mention it in the reply when something new is saved ("I'll remember Dr. Patel is Maya's orthodontist").

**Channel formatting:**

- SMS: at most 3 short paragraphs and 480 characters, no markdown, a deep link `https://<app>/chat?m=<messageId>` when cards exist.
- App: short text plus cards.

**Model:** configurable `MODEL_ID`. Start with what invokes in our account. On the free AWS plan, Nova works in-region. Claude Haiku needs the `us.` profile, so it requires the paid plan.

- Use Bedrock Guardrails if available: denied topics for diagnosis and financial/legal advice; block SSN and card numbers.
- If the AI is down, the snapshot shows `ai.status = 'off'`, and estimates/sequences still work through their endpoints.

## 9. SMS via Twilio (owner D)

**Facts:**

- Twilio Programmable Messaging sends **SMS** (green bubbles on iPhone), not iMessage.
- **Trial account:** 100 SMS, sent only to up to 5 verified numbers. US 10DLC registration needs a paid account.
- Twilio handles `STOP`/`START`/`HELP` opt-outs on the number automatically and still forwards them to the webhook. Mirror them into `SenderLink.status`.

**Inbound** — `POST /v1/webhooks/twilio/sms`, form-encoded `From`, `To`, `Body`, `MessageSid`:

1. Validate `X-Twilio-Signature` with the official helper and the auth token. Reject otherwise.
2. Deduplicate by `MessageSid`.
3. Respond `200` with empty TwiML (`<Response/>`) **immediately**. Reply asynchronously; Twilio times out webhooks.
4. Route by sender:
    - **Unknown sender:** `JOIN <code>` → set `SenderLink` to `awaiting_confirmation` (the app shows "Confirm +1 ••• 4567?"). Anything else gets one generic sign-up reply and is stored nowhere else.
    - **Linked sender:**
        - `CONFIRM <token>` → confirm flow (§6);
        - `STOP` / `START` → opt-out / opt-in;
        - `HELP` → help text;
        - `EMAIL TRANSCRIPT` → shortcut to `email_transcript`;
        - otherwise store the user `Message` (channel `sms`) and enqueue a turn.

**Outbound:**

- Send via the Twilio Messages API with `StatusCallback` → `/v1/webhooks/twilio/status`, which updates `Message.delivery`.
- Never send during quiet hours (except direct replies), never after STOP, and at most 1 proactive SMS per day.

**Local simulator** (saves trial SMS):

- `POST /v1/dev/sms-sim` (dev only, disabled in prod) takes `{from, body}`, runs the exact inbound pipeline with signature checking bypassed, and writes outbound texts to the `Message` log with `delivery.status = 'simulated'`.
- `snapshot.messaging.mode = 'simulated'` must show in the UI.

**Config:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` (secret), `TWILIO_FROM_NUMBER`, `PUBLIC_WEBHOOK_BASE_URL`.

## 10. Email: transcripts and office outreach (owner D)

**Provider:** any transactional email service with inbound parsing (Amazon SES, Postmark, Resend, SendGrid).

- **Outbound** works with a verified sender. In sandbox modes, recipients must also be verified, so verify the team's "office" demo inbox.
- **Inbound** replies need a domain we control (MX record). Without one, the fallback is an in-app "Paste the office's reply" box, which sends the text through the same parser.

**Transcript (`email_transcript`):**

- Payload `{ from, to (date range), memberIds?, channels? }`.
- Renders plain text + simple HTML: date, channel, speaker, text, card summaries as text.
- Sent to the household's verified email. Appears in history as a system message.

**Outreach (`draft_outreach_email` → `send_outreach_email`):**

- **Draft** contains:
    - patient first name and age;
    - procedures in plain words plus CDT codes when known;
    - requested windows ("upper braces in December 2026, lower braces in January 2027");
    - a request for written price confirmation / pre-treatment estimate;
    - plan name;
    - the user's preferred times (from memory);
    - reply instructions.
- **From / Reply-To:** from `floss@<domain>`; reply-to `office+<replyToken>@<domain>`. The user is CC'd. The user can edit the body in the app before approving.
- **Follow-up:**
    - A scheduled job checks `nextFollowUpAt`. If there's no reply after 2 business days, it sends a short follow-up (max 2), then marks the thread `closed` with a notification.
    - All dates use the demo clock when it is set.
- **Inbound reply** (`/v1/webhooks/email/inbound`):
    1. Verify the provider signature and the reply token.
    2. Store it as `role: 'office'`, `channel: 'email'`.
    3. The agent extracts `{offeredSlots[], confirmedPrices[{procedureCode, cents}], questions[]}`.
    4. Confirmed prices update `Quote` (source `office_email`) and re-price the affected care.
    5. Notify the user in-app and by SMS.

## 11. Scheduled jobs (owner D, using B's command handlers)

All jobs are idempotent, use the demo clock when it is set, and can be triggered by `POST /v1/demo/run-jobs`.

| Job | Schedule | Does |
| --- | --- | --- |
| Reminders | daily, 15:00 user TZ | Per member: unused max with known eligible care before reset (60/30/14 days); a cleaning still available this plan year; upcoming planned care. One notification per `dedupeKey`. SMS if opted in. |
| Provider re-verify | daily + on demand | Look up each provider in the directory adapter. On a status change, record a verification event, re-price affected care and estimates, and notify with before → after. |
| Outreach follow-up | hourly | §10 |
| Curiosity check-in | daily | 1 day after a planned care date: "How did Leo's cleaning go? Reply with what was done and I'll update his benefits." Skipped if a visit was already recorded. |
| Pending-action expiry | hourly | Expire actions after 24 h |

**Directory adapter:** `lookupProvider(provider) → {status, source, checkedAt}`.

- The demo uses a synthetic directory JSON with a toggle (`/v1/demo/providers/{id}/network`).
- We know of no public Lincoln provider-directory API, so the real adapter is a stub with a manual-confirmation fallback. Say so in the pitch.

## 12. Auth and security (owner B)

- Managed auth (default: Cognito hosted UI, authorization code + PKCE). JWT validated on every `/v1` route. The household is resolved from the token subject.
- Webhooks are verified by provider signature (Twilio, email). Demo/dev routes are disabled outside the demo user or stage.
- CORS allows only the app origin(s). Secrets live in a secret store, never in the client or git. The client only gets public config (API URL, auth domain/client id).
- Logs: no message bodies beyond 80 characters, no phone numbers unmasked. Retention ≤ 14 days.
- All data is synthetic. No real PHI. State this in the README and pitch (criterion 7).

## 13. Default reference stack (replaceable)

| Concern | Default | Fine to swap for |
| --- | --- | --- |
| API | API Gateway HTTP API + Lambda (Node 20/22, TypeScript) | Any HTTP server (Express/Fastify/Hono) on any host |
| Data | DynamoDB single table, transactions | Postgres with transactions |
| Queue | SQS FIFO (group = household) + DLQ | Any durable queue |
| Jobs | EventBridge Scheduler | cron on the host |
| Auth | Cognito | Any OIDC provider with JWTs |
| LLM | Bedrock Converse | Any provider behind the same `runTurn` |
| SMS | Twilio | — (team decision) |
| Email | SES | Postmark / Resend / SendGrid |
| IaC | SAM or CDK | Terraform / SST |
| Web hosting | Amplify Hosting (static SPA, rewrite all routes to `index.html`) | Any static host |

## 14. Integration with the frontend

- `packages/contracts` holds §4–5 types plus `fixtures/` (the Rivera household snapshot, each card type, every error shape). The frontend mock adapter serves these fixtures. The backend has a contract test that validates real responses against the same schemas (e.g. Zod).
- **Handoff order** (each step: B gives A the URL + an example `curl` + a fixture diff):
    1. `/health` + `/v1/snapshot` (demo household) deployed.
    2. Estimates + sequences.
    3. Turns (async) + pending actions.
    4. SMS link + webhook.
    5. Outreach + transcripts.
    6. Jobs + demo controls.
- **Definition of done (backend):**
    - All §7 tests pass.
    - Contract tests pass on the deployed stage.
    - The Rivera demo runs end to end on the deployed URL from a second device.
    - Replaying any webhook or confirm creates no duplicates.
    - A stale confirm returns a new preview.
    - Every delivery status shown is real.
