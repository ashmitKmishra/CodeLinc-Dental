# Contract changes

The agreed contract is now **code**: `packages/contracts/src/schemas.ts` (zod). If a shape must change, edit that file in a PR that A, B and C approve, then update `plans.ts` fixtures and the mock adapter. This file records changes from the older `BACKEND.md` §4–5 text.

## Applied on Oct 3

1. **No plan-PDF upload in the product.** The employee's plan is already on file; the backend parses the PDFs itself. The earlier `POST /v1/plan-documents` proposal is withdrawn.
2. **`PlanSummary`** replaces the old `Plan`. It is normalized from five real carrier PDFs (tiers, class rules, deductibles, annual and ortho maximums, frequency limits, waiting periods, notes) and every fact can carry `source.page`. See `BACKEND.md` §15 for the SQL shape.
3. **`GET /v1/procedures`** is new: the procedure list with `coverageClass` resolved for the member's plan (the same procedure can be a different class on a different plan).
4. **`MemberUsage`** is derived from visits, not stored. `annualMaxCents` and `remainingCents` are `null` when the plan has no annual maximum.
5. **`Preferences`** is `{ remindersOptIn, reminderDaysBefore[], quietHours }`; `PUT /v1/preferences`. `Reminder` is `benefits_expiring` only.
6. **`POST /v1/transcripts`** emails the chat transcript and returns `{ sentTo }`.
7. **`PendingAction`** types are `record_visit` and `email_transcript`.
8. `Estimate` assumptions are explicit strings (e.g. "We used your dentist's quote as the allowed amount"). A missing allowed amount is never silently guessed.

## Removed from v1 (still described in `BACKEND.md`, not used by the UI)

Providers and network re-verification, office outreach email threads, memory, curiosity check-ins, the demo clock.
