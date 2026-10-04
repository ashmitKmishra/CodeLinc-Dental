# Build brief: frontend v1

Restated from the team lead's instructions on Oct 3, then executed in the order in §5. **If anything is not in this file, the challenge slides, the six judge comments or the other md files, it is not built.**

## 0. Ground rules

1. **No invented features.** Sources are, in order: the challenge slides, the judge comments, `CONTEXT.md`, the carrier PDFs.
2. **No invented numbers.** Plan rules come from the backend, which parses the carrier PDFs. Dentist prices come from the user. Marketing copy has no dollar figures.
3. **No appointments or office emails anywhere in the UI.**
4. **Selling point:** an AI buddy one text away. Chats are saved, and the transcript can be emailed to you.
5. Light theme only. Don't push to GitHub: run it on localhost first.

## 1. Flow

`/` landing → `/signup` (or `/signin`) → `/app` dashboard.

There is **no upload step**. The employee's plan is already on file, so the sign-up screen says so.

## 2. Pages

**Landing.**
- Nav, right side, exactly three items: *How it works · Texting · Sign in*.
- Hero (deep green): the agent preview card rotates and scales **as the visitor scrolls**. It does not play on a timer. Uses the 21st Container Scroll pattern (`design-refs/21st/container-scroll-animation.tsx`) with `useScroll` and `useTransform`.
- Texting section: "your AI buddy is one text away", chats saved, transcript emailed.
- How Floss works: the challenge's three asks, in order:
    1. Describe a planned procedure (plan details already on file).
    2. Translate insurance language into what's covered and what you owe.
    3. Sequence care across the plan year.
- Also in Floss: the three bonuses from the slide: track annual maximum, in-network vs out-of-network, reminders before unused benefits expire.

**App.** Only what the challenge asks for.
- **Overview:** reminders, the plan on file (name, carrier, plan year, source document), annual maximum used and remaining per person (one person or a family), sign out. Texting is a popup.
- **Chat:** the AI buddy, with the same history as texts, and **Email transcript**.
- **Estimates, in/out-of-network and best order** are answered in chat (cards in the thread). There is no Care or Settings page.

## 3. Data from the PDFs (what the backend sends)

Five carrier summaries (Lincoln, Delta Dental, Aetna, MetLife, Cigna) differ in structure:

- 1 to 3 provider tiers, each with its own rates, deductible and allowed-amount basis.
- Class names differ by carrier (MetLife's "Basic" is preventive; root canal is *major* there and *basic* elsewhere).
- Annual maximum is a number, unlimited (MetLife High), or excludes orthodontics (Delta).
- Orthodontics is a lifetime maximum, sometimes by age, and not covered at all on Cigna.
- Frequency limits, age limits and waiting periods vary.
- Some facts are simply absent from a summary (for example waiting periods on Aetna). Absent means "not listed", never a guess.

The contract is the normalized `PlanSummary` in `packages/contracts`, with a relational table sketch in `BACKEND.md` §15. The frontend ships a fixture for each carrier and a mock/live adapter pair, so swapping to the real backend is a config change.

## 4. Engineering rules

- Vite + React + TypeScript, Tailwind v4 with the Floss tokens, Motion for React, TanStack Query, React Router, zod.
- One `FlossApi` interface with a mock and a live adapter. The live adapter validates every response against the zod schemas.
- All money math happens in the backend. The mock has a small stand-in calculator, clearly labeled as mock.
- Money is integer cents everywhere.

## 5. Execution order

| # | Step | Done when |
| --- | --- | --- |
| 1 | This brief; `BACKEND.md` data model; contract changes | Written |
| 2 | Monorepo scaffold: `apps/web`, `packages/contracts` | `npm install` works |
| 3 | `packages/contracts`: zod schemas, plan fixtures for the five carriers (six plans) | Fixtures parse |
| 4 | Design tokens, fonts, UI primitives | A page renders with tokens |
| 5 | API layer: `FlossApi`, mock (store, stand-in engine, chat), live adapter | Mock tests pass |
| 6 | Landing with scroll-linked hero | Hero card moves only with scroll |
| 7 | Sign up / sign in, auth guard | Redirects work |
| 8 | App shell and Overview | Shows usage for the sample family |
| 9 | Care | Estimate, network compare and sequence work |
| 10 | Chat with transcript | Ask, get cards, email transcript |
| 11 | Settings: texting and reminders | Link flow and toggles work |
| 12 | Verify | Typecheck, tests, build; screenshots at 390 / 768 / 1440 |
| 13 | Docs and report | md files updated; nothing pushed |
