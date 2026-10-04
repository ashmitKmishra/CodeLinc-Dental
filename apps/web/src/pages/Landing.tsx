import { Link } from 'react-router-dom';
import { CalendarRange, FileSearch, MessageCircle, Network, BellRing, Gauge } from 'lucide-react';
import { buttonStyles } from '@/components/ui/Button';
import { LandingNav } from '@/components/landing/LandingNav';
import { ScrollHero } from '@/components/landing/ScrollHero';
import { PhoneMock } from '@/components/landing/PhoneMock';
import { Wordmark } from '@/components/floss/Wordmark';

/** The challenge's three asks, in order. This is a real sequence, so it's numbered. */
const steps = [
  { icon: MessageCircle, title: 'Tell Floss what’s planned', body: 'Describe the procedure your dentist recommended. Your plan details are already on file, so there’s nothing to enter.' },
  { icon: FileSearch, title: 'See what’s covered and what you’ll owe', body: 'Insurance language becomes a clear breakdown: what your plan likely covers, what you’ll pay, and the reason for each number.' },
  { icon: CalendarRange, title: 'Get the best order for your care', body: 'Floss lays out when to schedule treatments across the plan year so you make the most of your benefits.' },
];

/** The three bonuses from the challenge. */
const also = [
  { icon: Gauge, title: 'Track your annual maximum', body: 'See how much of it you’ve used through the plan year.' },
  { icon: Network, title: 'Compare in-network and out-of-network', body: 'Same procedure, side by side, with the difference spelled out.' },
  { icon: BellRing, title: 'Get a reminder before benefits expire', body: 'A nudge before the plan year ends, while there’s still time to use them.' },
];

export default function Landing() {
  return (
    <div className="bg-canvas">
      <LandingNav />
      <main>
        <ScrollHero />

        <section id="texting" className="scroll-mt-16 bg-surface">
          <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-5 py-20 md:grid-cols-[1fr_auto] md:gap-20 md:px-8 md:py-28">
            <div className="flex max-w-[560px] flex-col gap-6">
              <h2 className="t-display">Your AI buddy is one text away.</h2>
              <p className="t-body-lg text-ink-muted">
                No app to open. Text a question about your plan or a procedure and get the answer in plain words. Every chat is saved, and you can have the transcript emailed to you whenever you want it.
              </p>
              <div><Link to="/signup" className={buttonStyles({ size: 'lg' })}>Get started</Link></div>
            </div>
            <PhoneMock />
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-16 bg-canvas">
          <div className="mx-auto max-w-[1200px] px-5 py-20 md:px-8 md:py-28">
            <h2 className="t-display max-w-[640px]">How Floss works</h2>
            <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
              {steps.map(({ icon: Icon, title, body }, i) => (
                <li key={title} className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <span aria-hidden className="inline-flex size-9 items-center justify-center rounded-full bg-brand font-display font-bold text-on-brand">{i + 1}</span>
                    <span aria-hidden className="h-0.5 flex-1 rounded-full bg-line-strong md:block" />
                  </div>
                  <Icon aria-hidden className="size-6 text-brand" />
                  <h3 className="t-h2">{title}</h3>
                  <p className="text-ink-muted">{body}</p>
                </li>
              ))}
            </ol>

            <div className="mt-16 border-t border-line pt-10">
              <h3 className="t-h3 text-ink-muted">Also in Floss</h3>
              <ul className="mt-6 grid gap-8 md:grid-cols-3 md:gap-8">
                {also.map(({ icon: Icon, title, body }) => (
                  <li key={title} className="flex gap-4">
                    <Icon aria-hidden className="mt-0.5 size-6 shrink-0 text-brand" />
                    <div className="flex flex-col gap-1">
                      <p className="t-body-strong">{title}</p>
                      <p className="t-small text-ink-muted">{body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="on-shell bg-shell">
          <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-6 px-5 py-20 text-center md:px-8 md:py-24">
            <h2 className="t-display text-shell-ink">Start with a text.</h2>
            <Link to="/signup" className={buttonStyles({ variant: 'accent', size: 'lg' })}>Create your account</Link>
          </div>
        </section>
      </main>

      <footer className="bg-shell">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-3 border-t border-shell-active px-5 py-8 md:flex-row md:items-center md:justify-between md:px-8">
          <Wordmark dark />
          <p className="t-small text-shell-muted">Floss is a CodeLinc 11 demo. Estimates aren’t a guarantee of coverage or payment.</p>
        </div>
      </footer>
    </div>
  );
}
