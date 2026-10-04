# Walkthrough: sign up, the mock plan "PDFs", and what to try

About 10 minutes. Everything runs on your machine with sample data. No backend is needed.

## 1. Start it

```bash
cd CodeLinc-Dental
npm install        # first time only
npm run dev        # open http://127.0.0.1:5173
```

Stop it with `Ctrl+C`. If port 5173 is busy, close the other terminal first.

## 2. Sign up

1. On the landing page, scroll the hero. The app card tilts flat and rises **only as you scroll**.
2. Click **Get started** (or **Sign in** in the nav, then **Create an account**).
3. Fill in the form:
   - **First name:** anything (optional).
   - **Work email:** any valid-looking email, e.g. `jordan@company.com`.
   - **Password:** **12 or more characters**, e.g. `correct-horse-1`.
4. **Create account** takes you to the dashboard (`/app`). Your plan is already there: there's no upload step.

**Signing in later:** any valid email plus any non-empty password works (this is mock sign-in). **Sign out:** bottom of Overview. Your sign-in is remembered in the browser until you sign out.

## 3. Where the "PDF" data comes from

The app has **no PDF upload**: in the real product the backend reads each employer's PDF and sends the plan data. In mock mode that data comes from six plans built from the **real PDFs you shared**:

| Plan | What's different about it |
| --- | --- |
| **Lincoln** (default) | One network ("any dentist"), $1,500 yearly max, braces are child-only with a $1,500 **lifetime** max |
| **Delta Dental** | 3 dentist tiers (PPO, Premier, nonparticipating), $2,000 yearly max |
| **Aetna** | Major care paid at 80%, $2,500 yearly max, in/out of network |
| **MetLife Standard** | In/out-of-network rates, no deductible in network, root canal counts as major |
| **MetLife High** | **No yearly maximum** |
| **Cigna** | **No orthodontics**, deductible applies even to preventive care |

**Switch plans or household:** the floating **Demo** button (bottom right) → *Carrier’s plan* / *Who’s on the plan* (try *Just me* to see the one-person layout). Or load a URL with the plan in it (it must be a full page load, so type it in the address bar): `http://127.0.0.1:5173/?plan=delta`. Keys: `lincoln`, `delta`, `aetna`, `metlife-standard`, `metlife-high`, `cigna`.

**Where it lives in code:** `packages/contracts/src/plans.ts`. To change a number or add a plan, edit that file (copy a plan, give it a new key in `planFixtures`). **To plug in the real backend** instead, copy `apps/web/.env.example` to `apps/web/.env.local`, set `VITE_DATA_MODE=live` and `VITE_API_BASE_URL`. The app then calls the backend and checks every response against the contract.

## 4. What to try, in order

### Overview
Top to bottom: texting banner, **Reminders**, **Your plan on file**, **Annual maximum, by person**, **Sign out**.
- **Reminders:** switch on/off, tick 60 / 30 / 14 days; the list below follows.
- **Your plan on file:** plan name, carrier · plan year, and the source PDF file name and page count.
- **Annual maximum** (Lincoln): Jordan $244 used, $1,256 left. Sam $120. Maya $0. Leo $95. Pick **Just me** in Demo and the single card spans the full row.
- **Connect texting** (banner) or the **Texting not linked** block in the sidebar opens a popup: **Get a code** → `JOIN XXXXXX` → **Demo: pretend I sent the text** → Linked. (No real SMS in the demo.)

### Chat
1. Chat → click **What will a crown cost me?** Floss **asks for your dentist's quote** instead of guessing a price.
2. Type `He quoted $1,200` → you get the breakdown (Jordan: plan pays $600, you pay $600).
3. Type `Leo had a filling, the bill was $180` → a dashed **Needs your OK** card → **Confirm**. Go to Overview: Leo's meter moved.
4. Chat → **Email transcript** in the header (email is simulated in the demo).

### Other plans
Demo → **Delta Dental** or **Cigna**, then ask in chat about a crown or braces. Cigna says orthodontics isn't covered.

## 5. Not in the demo

Real PDF upload (by design), real texts and emails, real sign-in, appointments and office emails, provider verification, memory. The app's AI is a rule-based stand-in: it only answers the questions above.
