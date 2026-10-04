import { Link } from 'react-router-dom';
import { Wordmark } from '@/components/floss/Wordmark';

/** Right side is exactly: How it works, Texting, Sign in. */
export function LandingNav() {
  const link = 'rounded-sm px-1 py-2 t-small-strong text-shell-muted transition-colors hover:text-shell-ink sm:text-base';
  return (
    <header className="on-shell fixed inset-x-0 top-0 z-30 bg-shell/85 backdrop-blur-md">
      <nav aria-label="Main" className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-5 py-3 md:px-8">
        <Link to="/" aria-label="Floss home"><Wordmark dark /></Link>
        <div className="flex items-center gap-4 sm:gap-7">
          <a href="#how-it-works" className={link}>How it works</a>
          <a href="#texting" className={link}>Texting</a>
          <Link to="/signin" className={`${link} !text-shell-ink`}>Sign in</Link>
        </div>
      </nav>
    </header>
  );
}
