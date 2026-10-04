import type { Conversation, Member, Message, Preferences, Snapshot, Turn } from '@floss/contracts';

/** Errors always arrive in this shape, whichever adapter is in use. */
export class FlossApiError extends Error {
  constructor(public code: string, message: string, public retryable = false, public status = 0, public requestId?: string) {
    super(message);
    this.name = 'FlossApiError';
  }
}

/** One method per endpoint in BACKEND.md §4. The mock and live adapters implement the same interface. */
export interface FlossApi {
  readonly mode: 'mock' | 'live';
  getSnapshot(): Promise<Snapshot>;
  /** No conversationId starts a new chat; the reply says which conversation the turn landed in. */
  sendTurn(text: string, conversationId?: string): Promise<{ turnId: string; conversationId?: string }>;
  getTurn(turnId: string): Promise<Turn>;
  listConversations(): Promise<Conversation[]>;
  listMessages(opts?: { cursor?: string; limit?: number; conversationId?: string }): Promise<{ messages: Message[]; nextCursor: string | null }>;
  confirmAction(actionId: string): Promise<void>;
  cancelAction(actionId: string): Promise<void>;
  createLinkCode(): Promise<{ code: string; flossNumber: string; expiresAt: string }>;
  unlinkPhone(): Promise<void>;
  updatePreferences(prefs: Preferences): Promise<void>;
  requestTranscript(): Promise<{ sentTo: string }>;
  /** Mock only: helpers for demos and development. Undefined on the live adapter. */
  dev?: {
    plans: { key: string; label: string }[];
    currentPlanKey(): string;
    setPlan(key: string): void;
    currentHousehold(): 'family' | 'solo';
    setHousehold(mode: 'family' | 'solo'): void;
    simulateText(): void;
    reset(): void;
    /** Used by the live adapter to price the sample plan for the signed-in household. */
    setMembers(members: Member[]): void;
  };
}
