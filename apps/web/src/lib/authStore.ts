import { useSyncExternalStore } from 'react';

/**
 * Sign-in state. Mock mode accepts any credentials. For the live backend, replace `signInMock` with the
 * Cognito hosted-UI flow (authorization code + PKCE) and store the access token in `floss.token`;
 * `getAccessToken()` is what the live adapter sends as the Bearer token.
 */
export interface AuthUser { id: string; name: string; email: string }
const KEY = 'floss.auth';
const TOKEN_KEY = 'floss.token';
const listeners = new Set<() => void>();

const read = (): AuthUser | null => {
  try { const raw = localStorage.getItem(KEY); return raw ? (JSON.parse(raw) as AuthUser) : null; } catch { return null; }
};
let current: AuthUser | null = read();
const emit = () => listeners.forEach((l) => l());

export const getAuthUser = () => current;
export const getAccessToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };

export function signInMock(email: string, name?: string): AuthUser {
  const first = name?.trim() || email.split('@')[0]!.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  current = { id: 'user-1', name: first, email };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* storage unavailable: stay signed in for this tab */ }
  emit();
  return current;
}

export function signOut() {
  current = null;
  try { localStorage.removeItem(KEY); localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  emit();
}

export const useAuthUser = () => useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, getAuthUser, getAuthUser);
