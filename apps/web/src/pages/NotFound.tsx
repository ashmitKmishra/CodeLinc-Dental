import { Link } from 'react-router-dom';
import { buttonStyles } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="t-h1">That page doesn’t exist</h1>
      <p className="text-ink-muted">Check the link, or head back to the start.</p>
      <Link to="/" className={buttonStyles()}>Back to Floss</Link>
    </main>
  );
}
