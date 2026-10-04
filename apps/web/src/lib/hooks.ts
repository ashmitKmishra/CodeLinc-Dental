import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api, FlossApiError } from '@/lib/api';

export const keys = { snapshot: ['snapshot'] as const };

const useVisible = () => {
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible');
  useEffect(() => {
    const on = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return visible;
};

/** The one read the whole app renders from. Polls every 2s while the tab is visible so texts show up without a refresh. */
export function useSnapshot() {
  const visible = useVisible();
  return useQuery({
    queryKey: keys.snapshot,
    queryFn: () => api.getSnapshot(),
    refetchInterval: visible ? 2000 : false,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
    retry: (n, err) => (err instanceof FlossApiError ? err.retryable && n < 3 : n < 3),
  });
}

/** After any write, refresh the snapshot right away instead of waiting for the next poll. */
export function useRefreshAfter() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: keys.snapshot });
}

export function useAction<TArgs, TOut = void>(fn: (args: TArgs) => Promise<TOut>) {
  const refresh = useRefreshAfter();
  return useMutation({ mutationFn: fn, onSuccess: () => { void refresh(); } });
}

export const errorMessage = (e: unknown) => (e instanceof FlossApiError ? e.message : 'Something went wrong. Try again.');

/** For screens rendered inside the app shell, which only mounts them once the snapshot has loaded. */
export function useLoaded() {
  const { data } = useSnapshot();
  if (!data) throw new Error('Snapshot not loaded');
  return data;
}
