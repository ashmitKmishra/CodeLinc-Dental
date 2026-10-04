# Floss — frontend: design and build guide

Owner: A (Ashmit). Read `CONTEXT.md` (what and why) and `BACKEND.md` §4–5 (the API you code against).

**This file is the whole plan for the UI:**

1. tools to install;
2. the design system (final tokens);
3. the Figma-first workflow;
4. every screen and state;
5. the motion spec;
6. code structure and the definition of done.

**Goal: no back-and-forth while coding.** Everything visual is decided in Figma before code. Every data shape is mocked from the contract before the backend exists.

## Built (Oct 3): how to run it

```bash
npm install && npm run dev      # http://127.0.0.1:5173, mock mode with sample data
```

| Route | Screen | Data |
| --- | --- | --- |
| `/` | Landing: scroll-linked hero (`ScrollHero`), texting, how it works. Nav is exactly *How it works · Texting · Sign in* | none |
| `/signup`, `/signin` | Account (mock accepts any valid credentials) | none |
| `/app` | Overview, top to bottom: texting banner, **Reminders**, **Your plan on file**, annual max per person (adapts to one person), **Chat transcript**, sign out. Texting opens as a popup (Connect texting button, sidebar block). Mock-only floating **Demo** button | `Snapshot`, `PUT /v1/preferences`, `POST /v1/transcripts`, link-code endpoints |
| `/app/chat` | AI buddy, same history as texts, **Email transcript** | `POST /v1/turns`, `GET /v1/turns/{id}` |
| `/app/care`, `/app/settings` | Removed. Both redirect to `/app` | none |

- **Structure:** `src/lib/api` has the `FlossApi` interface, `mock/` (store, stand-in engine, chat) and `live.ts` (fetch + zod validation against `@floss/contracts`). `VITE_DATA_MODE=live` switches every screen to the backend. Screens never import the mock.
- **Hero scroll:** `components/landing/ScrollHero.tsx` follows the 21st *Container Scroll Animation* pattern (`design-refs/21st/`). `useScroll` on a tall section with a sticky stage; the card's `rotateX`, `scale` and `y` come from `scrollYProgress`. Nothing plays on a timer. Reduced motion renders it flat.
- **Auth:** `src/lib/authStore.ts` is mock. Replace `signInMock` with Cognito hosted UI (PKCE) and store the token in `floss.token`; the live adapter already sends it as `Authorization: Bearer`.
- **Not built (by decision):** PDF upload, appointments, office emails, provider verification, memory. The Figma file still shows some of these; the code and `BUILD-BRIEF.md` win.
- **Not shadcn/ui yet:** primitives in `components/ui` are hand-written with the Floss tokens. Swap in shadcn components if the team wants them; the tokens in `styles/index.css` are the same.
- **Checks:** `npm run typecheck && npm test && npm run build` (23 tests: the stand-in engine against numbers worked by hand from the Lincoln PDF, and mock-vs-contract conformance for all six plans).


---

## 0. The workflow in one picture

```
Install tools (30 min)
  → Figma: foundations (variables + components) via Figma MCP (1–1.5 h)
  → Figma: all screens × states, mobile + desktop (2 h)
  → Design freeze: you review + tweak by hand (20–30 min), mark "Approved v1"
  → Code: tokens → components → screens from Figma links, mock data first (rest of time)
  → Motion pass → verify against Figma + checklist → switch adapter to live API
```

**Rules that kill back-and-forth:**

- Tokens in §2 are final. Figma variables and `tokens.css` are generated from the same table.
- Every screen is designed in **all** its states (loading, empty, error, pending, offline, demo) before coding. Copy is final in Figma.
- Code uses only fixtures that match `BACKEND.md` §4. When the backend arrives, only the adapter changes.
- One component inventory (§4). No one-off styles in screens.

## 1. Tools

**Figma file (built Oct 3):** https://www.figma.com/design/Oen8RIadWbldvFC79iN62a

| Page | Contents |
| --- | --- |
| Foundations & Components | Variables, text and shadow styles, 33 icons, and components: Button, Chip, Source, Avatar, Channel, Nav item, Input |
| App screens | Onboarding A–E; app F–J (Overview, Care, Chat, Activity, Settings); mobile M1–M2 |
| Motion | Six keyframed moments with spec cards. Press play in Figma. |

The App screens page also has three newer frames:

- **K1 · Home after sign-in:** the upload section, then a full-page Gemini-style agent in Floss green.
- **K2 · Agent conversation:** the prompt docks at the bottom once you ask.
- **P · Plan PDF states:** 15 upload and reading cases, each mapped to `PlanDocument.status` / `error.code` in `contract-changes.md`.

It also holds **L · Landing**: a green hero, the agent screen rising on scroll, a word-reveal section, "Or just text it", how it works, and a closing band. The 21st.dev component for each page is listed in `md-files/21ST-COMPONENTS.md`.

All numbers in the file are sample placeholders from the demo fixture. In the app they come from the parsed plan PDF and `/v1/snapshot`.

**Already set up in the repo:**

- `skills-lock.json` lists every skill below. Restore them all with `npx skills experimental_install`.
- `.mcp.json` registers the Figma and shadcn MCP servers. Claude Code asks you to approve them the first time; then run `/mcp` and sign in to Figma.
- `PRODUCT.md` and `DESIGN.md` give impeccable its product and design context.

The commands below are only needed if you set this up somewhere else.

**Use Claude Code** (this desktop app, or `claude` in a terminal) in the repo folder. It reads this file plus the MCPs and skills below. Codex works the same way with the same skills (`--agent codex`), but it isn't installed on this Mac. Pick one tool for the frontend and stay with it.

### 1.1 Skills (run in the repo root)

```bash
npx skills add pbakaus/impeccable --agent claude-code -y
```

```bash
npx skills add anthropics/skills --skill frontend-design --agent claude-code -y
```

```bash
npx skills add shadcn-ui/ui --skill shadcn --agent claude-code -y
```

```bash
npx skills add figma/mcp-server-guide --skill figma-use --skill figma-generate-library --skill figma-generate-design --skill figma-design-to-code --skill figma-implement-motion --skill figma-use-motion --skill figma-create-new-file --agent claude-code -y
```

| Skill | When it's used |
| --- | --- |
| **impeccable** (pbakaus, ~310K installs) | Design critique, polish, typography, color, motion, anti-patterns. Use its steering commands (audit, polish, distill, animate) after each screen. |
| **frontend-design** (Anthropic) | Distinctive, non-generic UI while coding |
| **shadcn** (official) | Correct use of shadcn/ui primitives |
| **figma-use + figma-generate-library** | Build variables and components in Figma |
| **figma-generate-design** | Build screens in Figma |
| **figma-design-to-code** | Implement a Figma frame in React |
| **figma-use-motion / figma-implement-motion** | Animate in Figma and carry it into code |
| **figma-create-new-file** | Create the Figma file |

### 1.2 MCP servers

**Figma (official remote server).** In Claude Code:

```bash
claude plugin install figma@claude-plugins-official
```

If the plugin isn't available, add the server directly:

```bash
claude mcp add --transport http figma https://mcp.figma.com/mcp
```

Then run `/mcp` inside Claude Code and sign in to Figma. In Codex the equivalent is `codex mcp add figma --url https://mcp.figma.com/mcp`, then `codex mcp login figma`.

- Writing to the canvas (`use_figma`) is newer than reading. Expect occasional failures and keep each call to one section.
- Any Figma seat can create files in **Drafts**. Editing a team file needs a Full seat with edit access.

**shadcn** (component registry search and install):

```bash
npx shadcn@latest mcp init --client claude
```

**Playwright** (screenshots of the running app for the verify step; optional in the desktop app, which has a built-in browser):

```bash
claude mcp add playwright -- npx @playwright/mcp@latest
```

**21st.dev** (optional; free plan allows 2 component retrievals a day): `npx @21st-dev/cli@latest init --client claude --write`. Use it at most for the nav shell and a timeline pattern.

### 1.3 About "Framer"

- **Animations in the app use [Motion](https://motion.dev)** (formerly *Framer Motion*): `npm i motion`, `import { motion } from 'motion/react'`.
- The Framer **website builder** is not used. It builds marketing sites, not our React app.
- If you want to *prototype* motion visually before code, use Figma's motion features through `figma-use-motion`. Then `figma-implement-motion` translates them to code.

## 2. Design system (final tokens)

**Concept: "a clear benefits statement with a friendly guide."**

- Calm teal brand, generous whitespace, big honest numbers.
- The **signature element is the Plan-Year Rail**: a horizontal timeline split by the reset line (Dec 31 | Jan 1). Care items sit on it as chips and move across the line when the user splits treatment. This is the visual of the braces demo.

### 2.1 Color

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | `#F7F9F8` | `#0D1A1C` | Page canvas |
| `--surface` | `#FFFFFF` | `#132326` | Cards |
| `--surface-2` | `#EEF3F2` | `#1A2E31` | Inset areas, rail track |
| `--border` | `#DCE4E2` | `#27403F` | Default 1px borders |
| `--border-strong` | `#B8C6C3` | `#3A5552` | Inputs, dividers that matter |
| `--text` | `#10282D` | `#E6F0EE` | Primary text |
| `--text-muted` | `#4E6469` | `#9FB4B2` | Secondary text (≥ 4.5:1 on surface) |
| `--brand` | `#006B72` | `#3FB6BC` | Primary actions, **actual** usage |
| `--brand-hover` | `#00575D` | `#5CC7CC` | Hover / pressed |
| `--brand-soft` | `#E0F0EF` | `#12393C` | Selected rows, change flash |
| `--on-brand` | `#FFFFFF` | `#062224` | Text on brand |
| `--projected` | `#5FA8AD` | `#2E7F84` | **Projected** usage (striped fill) |
| `--pending` | `#8A4B08` | `#F0B45B` | **Pending** (dashed outline) |
| `--success` / `--success-soft` | `#176B45` / `#E3F2EA` | `#4CC38A` / `#123526` | Savings, confirmed, in network |
| `--warning` / `--warning-soft` | `#8A4B08` / `#FBEFD9` | `#F0B45B` / `#3A2A10` | Incomplete, expiring, unknown network |
| `--danger` / `--danger-soft` | `#A4262C` / `#FBE5E6` | `#F07A7E` / `#3D1719` | Not covered, out of network, failed |
| `--info` / `--info-soft` | `#1F5FA8` / `#E4EEF9` | `#7DB3F0` / `#132B45` | Tips, curiosity questions |
| `--accent` | `#F2B544` | `#F2B544` | Highlights only (reset-line glow, savings sparkle); never text |
| `--shell` / `--shell-active` | `#0A3D42` / `#14545A` | — | Teal sidebar and its active item |
| `--shell-text` / `--shell-muted` | `#E6F2F1` / `#9CC3C1` | — | Text on the shell |

**Family member colors** (dot, avatar ring, rail chip edge; always paired with the name):

| Index | Name | Hex |
| --- | --- | --- |
| 0 | Jordan | `#3A6EA5` |
| 1 | Sam | `#8A5CB8` |
| 2 | Maya | `#C2557A` |
| 3 | Leo | `#C27C12` |

**Channel badges** (always icon + word):

| Channel | Color | Icon |
| --- | --- | --- |
| App | `--brand` | `Smartphone` |
| Text | `#2E7D32` | `MessageSquare` |
| Email | `#5B6B8C` | `Mail` |

**Rule:** actual / projected / pending must look different without color too:

- **actual** is a solid fill;
- **projected** is diagonal stripes (`repeating-linear-gradient` 45°, 6px);
- **pending** is a dashed 1.5px outline;
- each always carries the label ACTUAL / PROJECTED / PENDING.

### 2.2 Typography

- **Headings and money:** [Manrope](https://fonts.google.com/specimen/Manrope) 600/700/800.
- **Body and tables:** [Source Sans 3](https://fonts.google.com/specimen/Source+Sans+3) 400/600.
- **Codes and tokens** (D8080, CONFIRM K7Q2): JetBrains Mono 500.
- Self-host with `@fontsource-variable/manrope`, `@fontsource-variable/source-sans-3`, `@fontsource/jetbrains-mono`.
- All money uses `font-variant-numeric: tabular-nums`.

| Style | Size / line-height | Weight | Tracking | Use |
| --- | --- | --- | --- | --- |
| `display` | 44/48 (mobile 36/40) | Manrope 800 | -0.02em | Hero amounts |
| `h1` | 28/34 | Manrope 700 | -0.01em | Page titles |
| `h2` | 22/28 | Manrope 700 | -0.01em | Section titles |
| `h3` | 18/24 | Manrope 600 | 0 | Card titles |
| `money-lg` | 32/36 | Manrope 800, tnum | -0.01em | Card totals |
| `money-md` | 20/28 | Manrope 700, tnum | 0 | Line totals |
| `body-lg` | 18/28 | Source Sans 3 400 | 0 | Chat text on desktop |
| `body` | 16/24 | Source Sans 3 400 | 0 | Default |
| `body-strong` | 16/24 | Source Sans 3 600 | 0 | Labels, emphasis |
| `small` | 14/20 | Source Sans 3 400 | 0 | Secondary, table meta |
| `caption` | 12/16 | Source Sans 3 600, UPPERCASE | 0.06em | ACTUAL / PROJECTED, badges |

**Money format:** `$1,200` (no cents when `.00`), `$1,200.50` otherwise. "You pay" is always bolder than "Plan pays". Negative differences read as "saves $900", never "-$900".

### 2.3 Space, size, shape

| Category | Tokens |
| --- | --- |
| Spacing scale (px) | 0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 |
| Page padding | 16 mobile · 24 tablet · 32 desktop |
| Card padding | 16 mobile · 24 desktop |
| Gap between cards | 12 mobile · 16 desktop |
| Section gap | 32 |
| Radius | `xs` 6 (chips) · `sm` 8 (small inputs, tags) · `md` 12 (buttons, inputs) · `lg` 16 (cards) · `xl` 24 (sheets, drawers) · `full` (avatars, pills) |
| Borders | 1px `--border` default; 1px `--border-strong` for inputs; 1.5px dashed `--pending` for pending; selected card = 1.5px `--brand` |
| Focus ring | 2px `--brand` + 2px offset (`--bg` gap). Never removed. |
| Elevation, light | `e1` 0 1px 2px rgba(16,40,45,.06), 0 1px 1px rgba(16,40,45,.04) (cards) · `e2` 0 4px 12px rgba(16,40,45,.08) (hover, popovers) · `e3` 0 12px 32px rgba(16,40,45,.16) (drawers, dialogs) |
| Elevation, dark | No shadows; use `--surface-2` + border |
| Icons | Lucide, 20px (16 in dense tables), stroke 1.75 |
| Touch targets | ≥ 44×44 |
| Breakpoints | base 390 · `md` 768 · `lg` 1024 · `xl` 1440. Max content width 1200. |
| Layout, mobile | Single column, sticky header 56px, bottom tab bar 64px + safe area |
| Layout, desktop | Left sidebar 240px, content, optional right context panel 380px (estimates, drafts) |
| Z-index | base 0 · sticky 10 · dropdown 20 · drawer 30 · dialog 40 · toast 50 |

### 2.4 Voice

- Short, plain, warm.
- "Plan pays", not "coinsurance". "Resets Jan 1", not "benefit period renewal".
- Every number has a one-line *why* on tap or hover.
- Disclaimers in `small`, muted, never scary: "Estimate based on the sample plan. Your office's final price may differ."

## 3. Figma phase (do this before code)

### 3.1 Foundations

Paste into Claude Code:

> Load the figma-create-new-file, figma-use and figma-generate-library skills. Create a new Figma Design file in my Drafts called "Floss UI". Read md-files/FRONTEND.md §2 and create:
> - variable collections **Color** (modes Light and Dark, every token in §2.1 including member and channel colors), **Space**, **Radius**;
> - text styles for every row of §2.2;
> - effect styles e1–e3.
>
> Then build the components in §4 as proper component sets with variants, bound to variables, with auto layout, one section per call. Make a "Foundations" page documenting the tokens. Report the file URL.

### 3.2 Screens

Then paste:

> Load figma-use and figma-generate-design. In the Floss UI file, build every screen in md-files/FRONTEND.md §5 using only the library components and variables:
> - one page per route;
> - frames at 390 px (mobile) and 1440 px (desktop);
> - every listed state as its own frame;
> - realistic content from the Rivera demo in md-files/CONTEXT.md §6 (exact names and dollar amounts).
>
> Annotate motion moments from §6 with a sticky note on each frame. Work one screen section per call and report progress.

**If writing to Figma fails or is too slow:** build the screens in code with mock data (§7). Capture them into Figma with the code-to-canvas tool (`generate_figma_design`) for review, edit in Figma, then apply the diffs. Same result, reversed order.

### 3.3 Design freeze checklist (you, about 20 minutes)

- [ ] Every screen has loading / empty / error / offline / pending / demo states
- [ ] Actual vs projected vs pending readable in grayscale
- [ ] All copy final (no lorem ipsum); demo numbers match CONTEXT.md §6
- [ ] Contrast checked (use Figma's contrast checker) for text on every surface, both themes
- [ ] Mobile frames fit 390 px with no horizontal scroll; tap targets ≥ 44
- [ ] Motion notes on the rail, meters, sync pulse, pending confirm, network flip
- [ ] Rename the page "✅ Approved v1". Code only from approved frames.

## 4. Component inventory

Base primitives come from shadcn/ui, restyled with our tokens: Button, Input, Textarea, Select, Combobox, Tabs, Dialog, Drawer (vaul), Sheet, Popover, Tooltip, Switch, Checkbox, Toast (sonner), Skeleton, Badge, Avatar, Separator, ScrollArea.

**Floss components:**

| Component | Variants / props | Notes |
| --- | --- | --- |
| `MoneyFigure` | size lg/md/sm; tone default/success/danger; `animateFrom` | Tabular nums; animated change (§6) |
| `UsageMeter` | actual, projected, pending, max; compact/full | Three segments, legend, "resets in N days" |
| `MemberChip` / `MemberAvatar` | member, selected, size | Color ring + initial + name |
| `MemberSwitcher` | All + members | Segmented control on Overview and Care |
| `ChannelBadge` | app/sms/email | Icon + word |
| `NetworkBadge` | in/out/unknown, verifiedAt | "In network · checked 2 h ago"; tap → re-verify |
| `EstimateCard` | estimate, compact/full | Lines with *why* expanders; totals; disclaimer; actions |
| `EstimateLine` | step, amount, why | Expand/collapse |
| `NetworkCompareCard` | in/out estimates | Two columns + difference |
| `PlanYearRail` | items, resetDate, interactive | **Signature.** Two zones split by the reset line; chips per care item; drag or toggle to move |
| `RailChip` | member, label, window, status | Member color edge; lock icon if deferral not approved |
| `SequenceResult` | baseline, best, difference | Before/after totals, reasons list, assumption chip |
| `PendingActionCard` | action | Preview, Confirm / Cancel, SMS token shown in mono |
| `OutreachThreadCard` | thread | Status stepper: Draft → Approved → Sent → Follow-up → Replied |
| `EmailDraftEditor` | draft | Subject/body editable, recipient, CC, Approve & send |
| `ChatBubble` | role, channel, cards | User right, assistant left; office emails as quoted cards |
| `TurnStatus` | queued/working/failed | Typing dots; retry |
| `NotificationItem` | kind, member, read | Curiosity questions styled `--info` |
| `ActivityItem` | visit/message/notification/verification/outreach | Unified row with channel badge + member chip |
| `MemoryItem` | fact, member, source | Delete with undo toast |
| `LinkPhoneFlow` | status | Unlinked → Code → Awaiting text → Confirm phone → Linked / Opted out / Simulated |
| `DemoBar` | demoClock, actions | Thin top bar only for the demo user: date picker, Run jobs, Network toggle, Reset |
| `EmptyState` | icon, title, body, action | One per list |
| `SyncPulse` | wraps any element | Ring glow when its entity changed remotely |
| Shell | `BottomNav` (mobile), `Sidebar` (desktop), `TopBar` (title, demo badge, messaging status, avatar → Settings) | |

## 5. Screens and states

Routes are fixed. Mobile tabs: **Overview · Care · Chat · Activity**; Settings opens from the avatar in the top bar.

### `/start` — setup

1. **Welcome:** "See what your family's dental plan really pays." Two buttons: **Use the demo family** (Riveras) · **Set up my plan**.
2. **Household:** add members (name, relationship, birth date).
3. **Plan:**
    - Upload the plan PDF (Summary of Benefits).
    - **Review what we read:** each rule shows its plain-English value and a "Plan PDF · p.N" source chip; tapping a rule shows the highlighted page.
    - Unclear or missing rules ask the user instead of guessing (see `contract-changes.md` §1).
    - Sample plan and manual entry are fallbacks.
4. **This year so far** (per member): used, deductible met, cleanings used, as-of date.
5. **Providers:** name, office email, specialty, network (or "check for me").
6. **Text Floss** (optional): the `LinkPhoneFlow`.
7. **Review & save.**

States: validation errors inline, saving, save failed + retry, unknown-rule warnings.

### `/overview` — dashboard

- **Top:** `MemberSwitcher`; hero "**$4,800** of 2026 benefits unused across the family · resets in 90 days" (Jordan $300 + Sam $1,500 + Maya $1,500 + Leo $1,500, as of Oct 3). The total is labeled *per-person maximums*.
- **Member cards** (grid): `UsageMeter`, cleanings "1 of 2 used", next eligible date, provider network badges.
- **Next best moves:** notifications and curiosity prompts ("Leo has 1 covered cleaning left — ask Maple Family Dental for a December slot?" → [Draft email] [Not now]).
- **Plan-Year Rail preview** of saved care (projected).
- **Recent activity** (5) with channel badges.
- **Top bar:** messaging status pill (Linked • Text / Not linked / Offline); a "Demo date: Dec 1, 2026" badge when `demoClock` is set.

States: loading skeleton, no household (→ /start), no care yet, AI off banner, stale data (fetch failing → "Showing data from 2 min ago"), remote change pulse.

### `/care` — estimate + timeline

- **Estimate builder** (right panel on desktop, drawer on mobile): member, procedure search (plain words + code), provider with `NetworkBadge` + "Re-check", date, quote, allowed (optional), network.
- **EstimateCard** with lines, totals and actions: **Compare network** · **Add to care plan** · **Ask the office to confirm**.
- **Care plan:** `PlanYearRail` with all items.
    - Each chip has: dentist approved deferral (switch; off = locked to now), depends on, earliest/latest.
    - **Find the best timing** → `SequenceResult` ("Upper braces Dec 2026, lower Jan 2027 · **saves $900**") → **Save plan** (pending action → confirm).
- **Outreach:** `OutreachThreadCard` for each request. **Ask the office** opens `EmailDraftEditor` (prefilled by the agent) → **Approve & send**.

States:

- calculating;
- incomplete (missing allowed amount → inline ask);
- not covered (frequency / age / waiting, with the reason);
- no cheaper schedule ("Doing it now is already cheapest");
- provider changed network (old price struck through → new price, with a "Checked just now" badge);
- outreach sending / sent / follow-up scheduled / replied (summary + "Use confirmed price" button) / failed.

### `/chat` — assistant

- One thread for all channels. Filter chips: All · App · Text · Email.
- Suggestion chips when empty: "Price Maya's braces", "What's left for Leo?", "Email the office", "Email me this conversation".
- Assistant replies render cards (§4). Pending actions show **Confirm** / **Cancel** and "or text CONFIRM K7Q2".
- Header menu: **Email transcript** (date range sheet), **What Floss remembers**.

States: turn queued/working (typing dots), failed + retry, AI unavailable (offers Estimate and Care), message sent by text (bubble with Text badge), long-history loading (scroll up loads older via `/v1/messages`).

### `/activity` — everything that happened

- Unified list: visits, messages, notifications, provider verifications, outreach emails.
- Filters by member, channel and type; search; date grouping.
- Each visit: evidence (self-reported / confirmed), source channel, **Correct** (creates a reversal).

States: empty, loading more, pending delivery, failed delivery (honest).

### `/settings`

Sections:

- Household & members
- My plan (plain-English rules, edit)
- Providers (network + last verified + **Verify now**)
- Text messaging (`LinkPhoneFlow`; "Simulated mode" banner when `messaging.mode = 'simulated'`)
- Reminders & quiet hours
- **What Floss remembers** (list, delete)
- **Email transcript**
- Demo controls (demo user only)

## 6. Motion spec (Motion for React)

**Setup:**

- Wrap the app in `<MotionConfig reducedMotion="user">` and `<LazyMotion features={domAnimation}>`. Use `m.*` components.
- Presets live in `src/motion/presets.ts`.
- Animate only `transform` and `opacity`. Meters may use `scaleX` with `transform-origin: left`.
- Nothing longer than 600 ms except the meter fill. Never block input.

**Presets:**

| Name | Value |
| --- | --- |
| `fast` | 120 ms, `[0.2, 0, 0, 1]` |
| `base` | 200 ms, `[0.2, 0, 0, 1]` |
| `enter` | 240 ms, `[0, 0, 0, 1]` |
| `exit` | 160 ms, `[0.3, 0, 1, 1]` |
| `snappy` | `{ type: 'spring', stiffness: 500, damping: 35 }` |
| `gentle` | `{ type: 'spring', stiffness: 220, damping: 26 }` |
| `meter` | `{ type: 'spring', stiffness: 120, damping: 20 }` (about 600 ms) |

| # | Moment | Behavior | Reduced motion |
| --- | --- | --- | --- |
| 1 | Route change | `AnimatePresence mode="wait"`; fade + 8px rise, `enter` / `exit` | Fade only |
| 2 | First load of cards | Stagger 40 ms, max 6 children, 12px rise | None |
| 3 | **Money changes** | `MoneyFigure` counts from old to new (`useSpring` + `useTransform`, 600 ms) and flashes `--brand-soft` for 800 ms | Instant value, flash only |
| 4 | **Usage meter** | Actual fills with `meter`; projected stripes slide in 120 ms later; pending outline fades in | Static |
| 5 | **Plan-Year Rail** (signature) | Moving an item across the reset line uses a shared `layoutId` with `gentle`; the reset line glows `--accent` once; the savings counter ticks (3). Desktop: `drag="x"` with snap to zones; mobile: a "Move to 2027" button. | Instant move, no glow |
| 6 | **Remote sync** (text/email changed something) | The changed element gets `SyncPulse` (2px brand ring, opacity 1→0 over 1.2 s); a toast slides in: "Leo's cleaning recorded · via Text" | Toast only |
| 7 | Chat | New bubble: 12px rise + fade, `snappy`; typing dots loop (1 s); cards expand with `layout` | Fade only |
| 8 | **Confirm action** | The button morphs to a check (`layout`), then the card collapses into the activity list (`layoutId` to the activity row) | Swap to check, no morph |
| 9 | Drawers and sheets | Mobile: slide up with `gentle`. Desktop panel: 24px slide + fade. | Fade |
| 10 | **Network change** | `NetworkBadge` flips (rotateX 90° → swap → 0°, 300 ms); the old price gets an animated strike-through, then the new price counts up | Swap, static strike |
| 11 | Outreach stepper | Completed steps fill left to right (`base`); an envelope icon nudges on send | Static |
| 12 | Skeletons | CSS shimmer 1.2 s | Static gray |

Prototype the signature moments (5, 6, 8, 10) in Figma with `figma-use-motion` if time allows, then implement them with `figma-implement-motion`.

## 7. Code

### 7.1 Stack

- Vite + React + TypeScript (strict), React Router, TanStack Query.
- Tailwind CSS v4 (theme from `tokens.css`), shadcn/ui, lucide-react, `motion`.
- zod (fixtures + response validation), react-hook-form, date-fns, sonner (toasts), vaul (drawers).
- No AWS SDK, model SDK or secrets in the browser.

### 7.2 Structure (`apps/web`)

```
src/
  main.tsx, App.tsx, routes.tsx
  styles/tokens.css          // §2 as CSS variables (light + .dark)
  styles/globals.css         // Tailwind @theme mapping tokens → utilities
  motion/presets.ts          // §6 presets
  lib/api/types.ts           // re-export from packages/contracts (BACKEND.md §4–5)
  lib/api/FlossApi.ts        // interface: one method per endpoint
  lib/api/mock.ts            // in-memory, mutable, seeded from fixtures
  lib/api/live.ts            // fetch + JWT + Idempotency-Key + error mapping
  lib/api/index.ts           // picks mock/live from VITE_DATA_MODE
  lib/hooks/                 // useSnapshot, useTurn, useAction, useChanged
  lib/format.ts              // money, dates, plurals
  components/ui/             // shadcn primitives (restyled)
  components/floss/          // §4 components
  features/{start,overview,care,chat,activity,settings}/
```

### 7.3 Data rules

- **`useSnapshot()`:**
    - `refetchInterval: 2000` while the tab is visible;
    - `refetchOnWindowFocus`;
    - backoff on error;
    - keep the previous snapshot and compute changed entity IDs → `useChanged(id)` drives `SyncPulse` and `MoneyFigure` animations.
- **`useTurn(turnId)`:** poll every 1 s until `completed` or `failed`. Show `TurnStatus` meanwhile.
- **Mutations:**
    - send `Idempotency-Key` (`crypto.randomUUID()`) and reuse it on retry;
    - invalidate the snapshot on success;
    - map the error shape (BACKEND.md §3) to inline messages;
    - `409 stale_preview` re-renders the new preview.
- **Mock adapter:**
    - Same interface. Fake latency of 300–800 ms.
    - Turns go queued → working → completed with canned replies.
    - Pending actions really change mock state and bump `revision`.
    - A dev-only **"Simulate text from Jordan"** button (in `DemoBar`) injects an SMS-channel message and visit, so sync animations can be built before the backend exists.
    - Reset returns to the exact Rivera fixture.
- Never compute coverage in components. Show the backend's `Estimate`. Instant previews may use the shared engine package only when it exists.

### 7.4 Env

| Variable | Value |
| --- | --- |
| `VITE_DATA_MODE` | `mock` or `live` |
| `VITE_API_BASE_URL` | the deployed API URL |
| `VITE_COGNITO_DOMAIN`, `VITE_COGNITO_CLIENT_ID`, `VITE_COGNITO_REDIRECT_URI` | public auth config |

Everything with `VITE_` is public. No secrets.

### 7.5 Code prompt

Paste into Claude Code after the design freeze:

> Read md-files/CONTEXT.md, md-files/FRONTEND.md and md-files/BACKEND.md §3–5. Load frontend-design, impeccable, shadcn and figma-design-to-code.
>
> 1. Scaffold apps/web per FRONTEND.md §7 (Vite React TS, Tailwind v4, shadcn, motion, TanStack Query, zod).
> 2. Generate styles/tokens.css from the Figma variables (or §2 if Figma is unavailable).
> 3. Build the mock FlossApi adapter from packages/contracts fixtures (create the fixtures from BACKEND.md §4–5 and the Rivera data in CONTEXT.md §6 if they don't exist).
> 4. Build the shell, then the §4 components, then screens in this order: /overview, /care, /chat, /activity, /settings, /start.
>
> Work from the Figma frames on the "✅ Approved v1" page (I'll paste links). Apply the §6 motion spec. After each screen: run the type check and build, take 390/768/1440 screenshots, compare to Figma and fix differences, then run an impeccable audit and fix what it finds. Commit after each screen on branch feature/web-ui.

### 7.6 Definition of done

- [ ] The full CONTEXT.md §6 demo runs in mock mode at 390 and 1440 px, then in live mode against the deployed API
- [ ] Every state in §5 is reachable (mock adapter has toggles for errors, AI off, offline, simulated SMS)
- [ ] Keyboard-only run-through works; visible focus everywhere; reduced motion respected
- [ ] Lighthouse accessibility ≥ 95 on Overview, Care and Chat
- [ ] `tsc --noEmit`, lint and `vite build` clean; no secrets or AWS SDK in the bundle
- [ ] Screens match the approved Figma frames (spacing, type, color); impeccable audit has no high-severity findings
- [ ] Deployed on Amplify Hosting with the SPA rewrite (B sets it up; you verify routes refresh correctly)

## 8. Sources

- Figma MCP server and code-to-canvas: https://developers.figma.com/docs/figma-mcp-server/code-to-canvas/
- Figma agent skills: https://github.com/figma/mcp-server-guide
- impeccable: https://skills.sh/pbakaus/impeccable/impeccable
- Anthropic frontend-design: https://github.com/anthropics/skills/tree/main/skills/frontend-design
- shadcn skill and MCP: https://skills.sh/shadcn-ui/ui/shadcn
- Motion for React: https://motion.dev/docs/react-installation
- 21st.dev MCP: https://help.21st.dev/ai/mcp
