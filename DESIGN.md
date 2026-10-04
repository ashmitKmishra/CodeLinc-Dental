# Design

Tokens, type scale and components live in `apps/web/src/styles/index.css` and `md-files/FRONTEND.md` §2. Follow them rather than inventing new values.

- **Color:** deep teal shell (`#0A3D42`) with a marigold accent (`#F2B544`, used for the plan-year reset line and the main call to action), calm light canvas, brand teal `#006B72` for actions and *actual* usage.
- **Type:** Manrope for headings and money (tabular numbers), Source Sans 3 for everything else, JetBrains Mono for codes like `CONFIRM K7Q2`.
- **Signature:** the hero card that tilts flat as you scroll, and the plan-year split (this plan year | resets | next plan year) in the best-order result.
- **Honesty in the UI:** every number from the plan carries a "Plan PDF · p.N" chip; estimates are labeled; absent facts say "not listed in your plan summary".
- **Motion:** scroll-linked hero, meter fill, money count, chip moves across the reset line. All respect reduced motion.
