import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { LayoutDashboard, MessageCircle, MessageSquare } from 'lucide-react';
import { DemoControls } from '@/components/floss/DemoControls';
import { TextingContext } from '@/components/floss/TextingContext';
import { TextingDialog } from '@/components/floss/TextingDialog';
import { Wordmark } from '@/components/floss/Wordmark';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Notice, Skeleton } from '@/components/ui/Feedback';
import { api } from '@/lib/api';
import { useAuthUser } from '@/lib/authStore';
import { cn } from '@/lib/cn';
import { errorMessage, useSnapshot } from '@/lib/hooks';

const nav = [
  { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/app/chat', label: 'Chat', icon: MessageCircle },
];

export function AppShell() {
  const { data, error, refetch, isFetching } = useSnapshot();
  const user = useAuthUser();
  const loc = useLocation();
  const linked = data?.messaging.status === 'linked';
  const [textingOpen, setTextingOpen] = useState(false);

  return (
    <TextingContext.Provider value={() => setTextingOpen(true)}>
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="on-shell sticky top-0 hidden h-screen flex-col gap-6 bg-shell p-4 lg:flex">
        <NavLink to="/" aria-label="Floss home" className="px-2 pt-2"><Wordmark dark /></NavLink>
        <div className="px-2">
          <p className="t-body-strong text-shell-ink">{data?.household.name ?? ' '}</p>
          <p className="t-small text-shell-muted">{data ? data.plan.carrier : ' '}</p>
        </div>
        <nav aria-label="App" className="flex flex-col gap-1">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => cn('flex h-10 items-center gap-3 rounded-md px-3 t-small-strong transition-colors', isActive ? 'bg-shell-active text-shell-ink' : 'text-shell-muted hover:bg-shell-active/60 hover:text-shell-ink')}>
              <Icon aria-hidden className="size-5" /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-3">
          <button type="button" onClick={() => setTextingOpen(true)} className="flex flex-col gap-0.5 rounded-md bg-shell-active p-3 text-left transition-colors hover:bg-shell-active/80">
            <span className="flex items-center gap-2 t-small-strong text-shell-ink"><MessageSquare aria-hidden className="size-4" />{linked ? 'Texting linked' : 'Texting not linked'}<span aria-hidden className={cn('ml-auto size-2 rounded-full', linked ? 'bg-ok' : 'bg-shell-muted')} /></span>
            <span className="t-small text-shell-muted">{linked ? data?.messaging.maskedPhone : 'Connect your phone'}</span>
          </button>
          {api.mode === 'mock' && <p className="px-1 t-small text-shell-muted">Sample household. Plan rules are from the plan document.</p>}
        </div>
      </aside>

      <div className="flex min-w-0 flex-col pb-20 lg:pb-0">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
          <Wordmark />
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setTextingOpen(true)} aria-label={linked ? 'Texting linked' : 'Connect texting'} className="relative rounded-full p-1.5 text-ink-muted hover:bg-surface-2"><MessageSquare aria-hidden className="size-5" /><span aria-hidden className={cn('absolute right-0.5 top-0.5 size-2 rounded-full', linked ? 'bg-ok' : 'bg-line-strong')} /></button>
            {user && <Avatar name={user.name} index={0} size={32} />}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-6 md:px-8 md:py-8">
          {error && !data ? (
            <Notice tone="bad" title="Can’t load your plan right now">
              <p>{errorMessage(error)}</p>
              <Button size="sm" variant="secondary" className="mt-2 w-fit" onClick={() => void refetch()} disabled={isFetching}>Try again</Button>
            </Notice>
          ) : !data ? (
            <div className="flex flex-col gap-4" aria-busy="true"><Skeleton className="h-9 w-64" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
          ) : (
            <motion.div key={loc.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: [0, 0, 0, 1] }}><Outlet /></motion.div>
          )}
        </main>

        <nav aria-label="App" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-2 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => cn('flex min-h-14 flex-col items-center justify-center gap-0.5 t-small-strong', isActive ? 'text-brand' : 'text-ink-muted')}>
              <Icon aria-hidden className="size-5" />{label}
            </NavLink>
          ))}
        </nav>
      </div>
      {data && <TextingDialog open={textingOpen} onClose={() => setTextingOpen(false)} messaging={data.messaging} />}
      <DemoControls />
    </div>
    </TextingContext.Provider>
  );
}
