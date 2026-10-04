import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Wordmark } from '@/components/floss/Wordmark';
import { signInMock, signInWithToken, useAuthUser } from '@/lib/authStore';
import { errorMessage } from '@/lib/hooks';
import { FlossApiError, isLive, liveAuth, toAuthUser } from '@/lib/api';

function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="on-shell relative hidden overflow-hidden bg-shell p-12 lg:flex lg:flex-col">
        <div aria-hidden className="pointer-events-none absolute -bottom-24 left-1/2 h-[60vh] w-[80%] -translate-x-1/2 rounded-full bg-brand/50 blur-[120px]" />
        <Link to="/" aria-label="Floss home" className="relative w-fit"><Wordmark dark /></Link>
        <div className="relative mt-auto flex max-w-[460px] flex-col gap-5">
          <p className="t-display text-shell-ink">Your dental plan, one text away.</p>
          <p className="t-body-lg text-shell-muted">Your plan is already on file. Sign in and ask Floss what a procedure will cost, what’s covered, and how much of your annual maximum is left.</p>
        </div>
      </aside>

      <main className="flex items-center justify-center px-5 py-12 md:px-8">
        <div className="flex w-full max-w-[400px] flex-col gap-8">
          <Link to="/" aria-label="Floss home" className="w-fit lg:hidden"><Wordmark /></Link>
          <div className="flex flex-col gap-2">
            <h1 className="t-h1">{title}</h1>
            <p className="text-ink-muted">{subtitle}</p>
          </div>
          {children}
          <p className="t-small text-ink-muted">{footer}</p>
        </div>
      </main>
    </div>
  );
}

const emailOk = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

function useAuthForm(kind: 'signin' | 'signup') {
  const nav = useNavigate();
  const loc = useLocation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!emailOk(email)) next.email = 'Enter your work email, like name@company.com.';
    if (password.length < (kind === 'signup' ? 12 : 1)) next.password = kind === 'signup' ? 'Use at least 12 characters.' : 'Enter your password.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    // Mock: any valid credentials work. Live: replace with the Cognito hosted-UI redirect (see lib/authStore.ts).
    setTimeout(() => { signInMock(email, name); nav((loc.state as { from?: string } | null)?.from ?? '/app', { replace: true }); }, 350);
  };
  return { name, setName, email, setEmail, password, setPassword, errors, busy, submit };
}

/** Live mode: phone number + password, checked by Amazon Cognito. Accounts are created by your benefits team, so there is no sign-up. */
function PhoneSignIn() {
  const nav = useNavigate();
  const loc = useLocation();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ phone?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);
  const e164 = (v: string) => { const d = v.replace(/[^\d+]/g, ''); return d.startsWith('+') ? d : d.length === 10 ? `+1${d}` : `+${d}`; };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!/^\+[1-9]\d{9,14}$/.test(e164(phone))) next.phone = 'Enter your mobile number with its country code.';
    if (!password) next.password = 'Enter your password.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const r = await liveAuth.signIn(e164(phone), password);
      signInWithToken(toAuthUser(r.user), r.token);
      nav((loc.state as { from?: string } | null)?.from ?? '/app', { replace: true });
    } catch (err) {
      const k = err instanceof FlossApiError ? err.code : '';
      setErrors({ password: k === 'NotAuthorizedException' || k === 'UserNotFoundException' ? 'That number or password isn’t right.'
        : k === 'TooManyRequestsException' || k === 'LimitExceededException' ? 'Too many tries. Wait a few minutes and try again.' : errorMessage(err) });
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-5">
      <Input label="Mobile number" type="tel" autoComplete="username" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} />
      <Input label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
      <Button type="submit" size="lg" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
    </form>
  );
}

export function SignUp() {
  const user = useAuthUser();
  const f = useAuthForm('signup');
  if (user) return <Navigate to="/app" replace />;
  if (isLive) return <Navigate to="/signin" replace />;
  return (
    <AuthLayout title="Create your account" subtitle="Use your work email. Your plan is already on file." footer={<>Already have an account? <Link to="/signin" className="font-semibold text-brand underline-offset-2 hover:underline">Sign in</Link></>}>
      <form onSubmit={f.submit} noValidate className="flex flex-col gap-5">
        <Input label="First name" autoComplete="given-name" value={f.name} onChange={(e) => f.setName(e.target.value)} />
        <Input label="Work email" type="email" autoComplete="email" inputMode="email" value={f.email} onChange={(e) => f.setEmail(e.target.value)} error={f.errors.email} />
        <Input label="Password" type="password" autoComplete="new-password" helper="At least 12 characters." value={f.password} onChange={(e) => f.setPassword(e.target.value)} error={f.errors.password} />
        <Button type="submit" size="lg" disabled={f.busy}>{f.busy ? 'Creating account…' : 'Create account'}</Button>
      </form>
    </AuthLayout>
  );
}

export function SignIn() {
  const user = useAuthUser();
  const f = useAuthForm('signin');
  if (user) return <Navigate to="/app" replace />;
  if (isLive) return (
    <AuthLayout title="Sign in" subtitle="Use the mobile number on your dental plan and your password." footer="Your employer added you to Floss. If your number isn’t recognized, ask your benefits team.">
      <PhoneSignIn />
    </AuthLayout>
  );
  return (
    <AuthLayout title="Sign in" subtitle="Welcome back. Your plan is waiting." footer={<>New to Floss? <Link to="/signup" className="font-semibold text-brand underline-offset-2 hover:underline">Create an account</Link></>}>
      <form onSubmit={f.submit} noValidate className="flex flex-col gap-5">
        <Input label="Work email" type="email" autoComplete="email" inputMode="email" value={f.email} onChange={(e) => f.setEmail(e.target.value)} error={f.errors.email} />
        <Input label="Password" type="password" autoComplete="current-password" value={f.password} onChange={(e) => f.setPassword(e.target.value)} error={f.errors.password} />
        <Button type="submit" size="lg" disabled={f.busy}>{f.busy ? 'Signing in…' : 'Sign in'}</Button>
      </form>
    </AuthLayout>
  );
}
