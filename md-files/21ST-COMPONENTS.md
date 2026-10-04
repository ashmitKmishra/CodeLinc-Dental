# 21st.dev components for each Floss page

Picked on Oct 3 from 21st.dev search and preview images, to match the Figma file (https://www.figma.com/design/Oen8RIadWbldvFC79iN62a).

**Rules for using these:**

- Restyle every component with our tokens (FRONTEND.md §2).
- Import animations from `motion/react`, not `framer-motion`.
- Keep the Figma layout. The component supplies behavior, not a new look.

**Quota:** the free plan allows **2 code downloads per day per account**. Two are already saved in `design-refs/21st/`, so don't download them again:

- `container-scroll-animation.tsx`
- `reading-text-reveal.tsx`

**Install:**

1. Set your own key: `export API_KEY_21ST=21st_sk_…` from https://21st.dev/settings/api-keys. Never commit it.
2. Run `npx shadcn@latest add "https://21st.dev/r/<author>/<slug>?api_key=$API_KEY_21ST"`.

| Page / Figma frame | Use for | 21st component | Link | Saved? |
| --- | --- | --- | --- | --- |
| **L · Landing** hero | Agent screen tilts 20°→0°, scales and rises as you scroll | Container Scroll Animation (Aceternity) | https://21st.dev/@manuarora700/components/container-scroll-animation | ✅ |
| L · Landing, reveal section | Words light up as you scroll | Reading Text Reveal | https://21st.dev/@waleedkibhen/components/reading-text-reveal | ✅ |
| L · Landing, "Or just text it" | Phone frame around the SMS thread | Phone Mockups 1 | https://21st.dev/@solaceui/components/phone-mockups-1 | — |
| L · Landing, alternate hero | Fallback if the scroll effect is too heavy on mobile | Hero with Product Mockup | https://21st.dev/@vaib215/components/hero-with-product-mockup | — |
| L · Landing nav | Top navigation | Navbar | https://21st.dev/@designali-in/components/navbar | — |
| **A · Sign up** | Split layout: form + brand panel | Sign In (rafa-porto) | https://21st.dev/@rafa-porto/components/sign-in | — |
| **B–E · Onboarding** | Plan / Family / Dentists / Texting progress | Stepper (Origin UI) | https://21st.dev/@originui/components/stepper | — |
| B · Upload plan | PDF dropzone + progress | File Upload | https://21st.dev/@anubra266/components/file-upload-1 | — |
| **F · Overview** and every app page | Teal sidebar with nav groups | Sidebar Nav Group | https://21st.dev/@felipemenezes098/components/collapsible-05 | — |
| F, G · money figures | Dollar amounts that count to the new value on change | Animated Number (ibelick) | https://21st.dev/@ibelick/components/animated-number | — |
| F, H · remote changes | "Leo’s cleaning recorded · via Text" toast | Sonner Toast | https://21st.dev/@isaiahbjork/components/primitive-sonner | — |
| **G · Care** outreach status | Drafted → Sent → Follow-up → Reply | Timeline (nyxbui) | https://21st.dev/@nyxbui/components/timeline | — |
| **H · Chat** | Message list + composer shell | Agent Chat (serafimcloud) | https://21st.dev/@serafimcloud/components/agent-chat | — |
| H · Chat, empty state | "Ready to help" with suggestions | AI Assistant Interface | https://21st.dev/@rafa-porto/components/ai-assistant-interface | — |
| **I · Activity** | Day-grouped event list with icons and times | Activity Feed | https://21st.dev/@felipemenezes098/components/item-19 | — |
| J · Settings | Built from shadcn primitives (Switch, Select, Button) | `npx shadcn@latest add switch select button` | — | — |

**Not used:**

- AI Prompt Box (dark, model picker; not our look).
- Advanced Stats (a hero-metric dashboard; we use the per-person table and the Plan-Year Rail instead).
- Bento Grid ("How it works" is a real sequence, so it's a 4-step rail).

**Download order** (2 per day): Phone Mockups 1 → Agent Chat → Animated Number → Stepper → Activity Feed → the rest as needed. Save each into `design-refs/21st/` once, so nobody downloads it twice.
