/** Money: no cents when whole dollars, "$1,200" or "$1,200.50". null renders as the fallback. */
export function money(cents: number | null | undefined, fallback = 'Not stated'): string {
  if (cents == null) return fallback;
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const s = `$${dollars.toLocaleString('en-US')}${rem ? `.${String(rem).padStart(2, '0')}` : ''}`;
  return neg ? `−${s}` : s;
}

/** Parse what a person types into cents: "1,200", "$1200.50", "180". Returns null when it isn't a positive amount. */
export function parseDollars(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const cents = Math.round(parseFloat(cleaned) * 100);
  return cents > 0 ? cents : null;
}

export const pct = (bps: number | null) => (bps == null ? 'Not covered' : `${bps / 100}%`);

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-US', opts);
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function ageOn(birthDate: string, on: string): number {
  const b = new Date(birthDate), o = new Date(on);
  let age = o.getFullYear() - b.getFullYear();
  if (o.getMonth() < b.getMonth() || (o.getMonth() === b.getMonth() && o.getDate() < b.getDate())) age--;
  return age;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The day after an ISO date: a plan year that ends Dec 31 resets Jan 1. */
export function dayAfter(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const n = new Date(y!, (m ?? 1) - 1, (d ?? 1) + 1);
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
