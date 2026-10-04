import { Message, Snapshot, Turn, ApiError, type Preferences } from '@floss/contracts';
import { z } from 'zod';
import { getAccessToken } from '@/lib/authStore';
import { FlossApiError, type FlossApi } from './FlossApi';

/**
 * Talks to the real backend (BACKEND.md §4). Every response is validated against the shared schemas, so a
 * backend that drifts from the contract fails loudly here instead of rendering wrong numbers.
 */
export function createLiveApi(baseUrl: string): FlossApi {
  async function call<T>(method: string, path: string, schema: z.ZodType<T> | null, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET') headers['Idempotency-Key'] = crypto.randomUUID();
    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new FlossApiError('network', 'Can’t reach Floss right now. Check your connection and try again.', true);
    }
    const text = await res.text();
    const json: unknown = text ? safeJson(text) : null;
    if (!res.ok) {
      const parsed = ApiError.safeParse(json);
      if (parsed.success) { const e = parsed.data.error; throw new FlossApiError(e.code, e.message, e.retryable, res.status, e.requestId); }
      throw new FlossApiError(res.status === 401 ? 'unauthenticated' : 'server_error', res.status === 401 ? 'Please sign in again.' : 'Something went wrong on our side. Try again in a moment.', res.status >= 500, res.status);
    }
    if (!schema) return undefined as T;
    const out = schema.safeParse(json);
    if (!out.success) throw new FlossApiError('contract_mismatch', 'The server sent data we didn’t expect.', false, res.status);
    return out.data;
  }
  const safeJson = (t: string): unknown => { try { return JSON.parse(t); } catch { return null; } };

  return {
    mode: 'live',
    getSnapshot: () => call('GET', '/v1/snapshot', Snapshot),
    sendTurn: (text) => call('POST', '/v1/turns', z.object({ turnId: z.string() }), { text }),
    getTurn: (id) => call('GET', `/v1/turns/${encodeURIComponent(id)}`, Turn),
    listMessages: ({ cursor, limit = 50 } = {}) => call('GET', `/v1/messages?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, z.object({ messages: z.array(Message), nextCursor: z.string().nullable() })),
    confirmAction: (id) => call('POST', `/v1/actions/${encodeURIComponent(id)}/confirm`, null),
    cancelAction: (id) => call('POST', `/v1/actions/${encodeURIComponent(id)}/cancel`, null),
    createLinkCode: () => call('POST', '/v1/messaging/link-code', z.object({ code: z.string(), flossNumber: z.string(), expiresAt: z.string() })),
    unlinkPhone: () => call('DELETE', '/v1/messaging/link', null),
    updatePreferences: (p: Preferences) => call('PUT', '/v1/preferences', null, p),
    requestTranscript: () => call('POST', '/v1/transcripts', z.object({ sentTo: z.string() })),
  };
}
