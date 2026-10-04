import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Dialog } from '@/components/ui/Dialog';
import { Select } from '@/components/ui/Field';
import { api } from '@/lib/api';
import { useRefreshAfter } from '@/lib/hooks';

/** Mock mode only. A floating button, so it takes no space from the real screens. */
export function DemoControls() {
  const dev = api.dev;
  const [open, setOpen] = useState(false);
  const refresh = useRefreshAfter();
  const [, bump] = useState(0);
  if (!dev) return null;
  const apply = (fn: () => void) => { fn(); bump((n) => n + 1); void refresh(); };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="fixed bottom-20 right-4 z-30 inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface px-3 py-2 t-small-strong text-ink shadow-e2 hover:bg-surface-2 lg:bottom-6 lg:right-6">
        <Sparkles aria-hidden className="size-4 text-warn" />Demo
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Demo controls">
        <div className="flex flex-col gap-5 p-5">
          <Chip tone="warn" className="w-fit">Sample data only</Chip>
          <Select label="Carrier’s plan" value={dev.currentPlanKey()} onChange={(e) => apply(() => dev.setPlan(e.target.value))} helper="Each plan is built from that carrier’s real summary of benefits.">
            {dev.plans.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </Select>
          <Select label="Who’s on the plan" value={dev.currentHousehold()} onChange={(e) => apply(() => dev.setHousehold(e.target.value as 'family' | 'solo'))} helper="Try just one person to see the layout adjust.">
            <option value="family">Whole family (4 people)</option>
            <option value="solo">Just me</option>
          </Select>
          <Button variant="secondary" className="w-fit" onClick={() => apply(() => dev.reset())}>Reset sample data</Button>
        </div>
      </Dialog>
    </>
  );
}
