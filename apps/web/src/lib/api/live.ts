import { Conversation, Message, Turn, ApiError, type Member, type Snapshot } from '@floss/contracts';
import { z } from 'zod';
import { getAccessToken, signOut, type AuthUser } from '@/lib/authStore';
import { FlossApiError, type FlossApi } from './FlossApi';
import { createMockApi } from './mock';

/** What the backend returns for the signed-in person (backend/rag/handler.py `_user_json`). */
export const LiveUser = z.object({
  phone: z.string(),
  name: z.string(),
  birthDate: z.string(),
  memberNumber: z.string().nullish(),
  employer: z.string(),
  insurance: z.string(),
  family: z.array(z.object({ firstName: z.string(), lastName: z.string(), relationship: z.enum(['spouse', 'child', 'other']), birthDate: z.string(), memberNumber: z.string().nullish() })),
});
export type LiveUser = z.infer<typeof LiveUser>;

const maskPhone = (p: string) => (p.length > 10 ? `${p.slice(0, p.length - 10)} ••• ••• ${p.slice(-4)}` : `••• ${p.slice(-4)}`);

export const toAuthUser = (u: LiveUser): AuthUser => ({ id: u.phone, name: u.name, email: '', phone: u.phone });

const toMembers = (u: LiveUser): Member[] => [
  { id: 'm-self', firstName: u.name.split(' ')[0]!, relationship: 'self', birthDate: u.birthDate, memberNumber: u.memberNumber },
  ...u.family.map((f, i) => ({ id: `m-${f.relationship}-${i}`, firstName: f.firstName, relationship: f.relationship, birthDate: f.birthDate, memberNumber: f.memberNumber })),
];

/**
 * Talks to the API Gateway backend (backend/rag). Sign-in, the household, chat history and chat answers are live.
 * The backend doesn't serve plan rules or usage yet, so those still come from the Lincoln sample plan, priced for the
 * signed-in household. Every response is validated, so a backend that drifts fails loudly instead of rendering wrong data.
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
      if (res.status === 401 && token) signOut();
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
  const notYet = async (): Promise<never> => { throw new FlossApiError('not_available', 'That isn’t available in the live app yet.', false, 501); };

  // Plan rules and usage until the backend serves them.
  const sample = createMockApi(() => null);
  let me: { token: string; user: LiveUser } | null = null;
  const getMe = async () => {
    const token = getAccessToken() ?? '';
    if (me?.token !== token) me = { token, user: (await call('GET', '/v1/me', z.object({ user: LiveUser }))).user };
    return me.user;
  };
  const listMessages = ({ limit = 50, conversationId }: { cursor?: string; limit?: number; conversationId?: string } = {}) =>
    call('GET', `/v1/messages?limit=${limit}${conversationId ? `&conversationId=${encodeURIComponent(conversationId)}` : ''}`, z.object({ messages: z.array(Message), nextCursor: z.string().nullable() }));

  return {
    mode: 'live',
    async getSnapshot() {
      const [user, { messages }] = await Promise.all([getMe(), listMessages()]);
      const members = toMembers(user);
      sample.dev!.setMembers(members);
      const snap: Snapshot = await sample.getSnapshot();
      return {
        ...snap,
        user: toAuthUser(user),
        household: { id: user.phone, name: user.family.length ? `${members[0]!.firstName}’s family` : members[0]!.firstName, members },
        messages,
        pendingActions: [],
        // The phone number is the account, so WhatsApp is already tied to it: there is no linking step.
        messaging: { status: 'linked', maskedPhone: maskPhone(user.phone), flossNumber: '', mode: 'live' },
      };
    },
    sendTurn: (text, conversationId) => call('POST', '/v1/turns', z.object({ turnId: z.string(), conversationId: z.string() }), { text, ...(conversationId ? { conversationId } : {}) }),
    listConversations: async () => (await call('GET', '/v1/conversations', z.object({ conversations: z.array(Conversation) }))).conversations,
    getTurn: (id) => call('GET', `/v1/turns/${encodeURIComponent(id)}`, Turn),
    listMessages,
    confirmAction: notYet,
    cancelAction: notYet,
    createLinkCode: notYet,
    unlinkPhone: notYet,
    updatePreferences: (p) => sample.updatePreferences(p),
    requestTranscript: notYet,
  };
}

/**
 * Sign-in with Amazon Cognito: phone number + password (USER_PASSWORD_AUTH, sent to Cognito over HTTPS).
 * The browser talks to Cognito directly; the ID token it gets back is the Bearer token for the API.
 */
export function createCognitoAuth(apiBaseUrl: string) {
  const region = import.meta.env.VITE_COGNITO_REGION ?? 'us-west-2';
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID ?? '';

  async function cognito<T>(target: string, body: Record<string, unknown>): Promise<T> {
    if (!clientId) throw new FlossApiError('not_configured', 'Sign-in isn’t configured for this site yet.', false);
    let res: Response;
    try {
      res = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}` },
        body: JSON.stringify({ ClientId: clientId, ...body }),
      });
    } catch {
      throw new FlossApiError('network', 'Can’t reach Floss right now. Check your connection and try again.', true);
    }
    const json = (await res.json().catch(() => null)) as (T & { __type?: string; message?: string }) | null;
    if (!res.ok || !json) throw new FlossApiError(String(json?.__type ?? 'auth_error').split('#').pop()!, json?.message ?? 'Sign-in failed.', false, res.status);
    return json;
  }

  return {
    /** Check the password, then load who signed in. Returns the ID token to use as the Bearer token. */
    async signIn(phone: string, password: string): Promise<{ token: string; user: LiveUser }> {
      const r = await cognito<{ ChallengeName?: string; AuthenticationResult?: { IdToken: string } }>('InitiateAuth', {
        AuthFlow: 'USER_PASSWORD_AUTH', AuthParameters: { USERNAME: phone, PASSWORD: password },
      });
      const token = r.AuthenticationResult?.IdToken;
      if (!token) throw new FlossApiError(r.ChallengeName ?? 'auth_error', 'This account needs a password reset. Ask your benefits team.', false);
      let res: Response;
      try { res = await fetch(`${apiBaseUrl}/v1/me`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }); }
      catch { throw new FlossApiError('network', 'Can’t reach Floss right now. Check your connection and try again.', true); }
      const me = z.object({ user: LiveUser }).safeParse(await res.json().catch(() => null));
      if (!res.ok || !me.success) throw new FlossApiError(res.status === 403 ? 'forbidden' : 'server_error', res.status === 403 ? 'That number isn’t on a Floss plan.' : 'Something went wrong on our side. Try again in a moment.', false, res.status);
      return { token, user: me.data.user };
    },
  };
}
