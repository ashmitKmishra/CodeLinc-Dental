import type { Message, Preferences, Snapshot, Turn } from '@floss/contracts';

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
  sendTurn(text: string): Promise<{ turnId: string }>;
  getTurn(turnId: string): Promise<Turn>;
  listMessages(opts?: { cursor?: string; limit?: number }): Promise<{ messages: Message[]; nextCursor: string | null }>;
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
  };
}
