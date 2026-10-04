import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { buttonStyles } from '@/components/ui/Button';
import { AgentPreview } from './AgentPreview';

/**
 * Scroll-linked hero (21st "Container Scroll Animation" pattern, design-refs/21st). Nothing here plays on a
 * timer: the card tilts flat, scales up and rises, and the headline lifts away, driven only by scroll position.
 * The section is taller than the viewport and its content is sticky, so the scroll "pins" the scene.
 */
export function ScrollHero() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });

  const rotateX = useTransform(scrollYProgress, [0, 0.8], [26, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.8], [0.86, 1]);
  const cardY = useTransform(scrollYProgress, [0, 0.8], ['0vh', '-30vh']);
  const headerY = useTransform(scrollYProgress, [0, 0.8], ['0vh', '-26vh']);
  const headerOpacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);
  const glow = useTransform(scrollYProgress, [0, 1], [0.5, 1]);

  return (
    <section ref={ref} className={reduce ? 'on-shell bg-shell pb-16 pt-28' : 'on-shell relative h-[210vh] bg-shell'} aria-label="Floss">
      <div className={reduce ? 'relative' : 'sticky top-0 h-screen overflow-hidden'}>
        <motion.div aria-hidden style={reduce ? undefined : { opacity: glow }} className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-[38%] h-[70vh] w-[90vw] max-w-[1200px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/60 blur-[140px]" />
          <div className="absolute left-[18%] top-[22%] h-[40vh] w-[40vw] rounded-full bg-shell-active/70 blur-[120px]" />
        </motion.div>

        <div className="relative mx-auto flex h-full max-w-[1200px] flex-col px-5 [perspective:1400px] md:px-8">
          <motion.div style={reduce ? undefined : { y: headerY, opacity: headerOpacity }} className="mx-auto flex max-w-[860px] flex-col items-center gap-6 pt-28 text-center md:pt-32">
            <h1 className="t-hero text-shell-ink">Your dental plan, one text away.</h1>
            <p className="max-w-[620px] t-body-lg text-shell-muted">
              Ask your AI buddy what a procedure will cost and what your plan covers. By text, or right here in the app, in plain words.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link to="/signup" className={buttonStyles({ variant: 'accent', size: 'lg' })}>Get started</Link>
              <a href="#how-it-works" className={buttonStyles({ variant: 'onShellOutline', size: 'lg' })}>See how it works</a>
            </div>
          </motion.div>

          <motion.div
            style={reduce ? undefined : { rotateX, scale, y: cardY, transformOrigin: 'center top' }}
            className="mx-auto mt-10 h-[min(620px,64vh)] w-full max-w-[1080px] rounded-[30px] border border-shell-muted/30 bg-shell-active p-2.5 shadow-e3 md:mt-12 md:p-3"
          >
            <AgentPreview />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
