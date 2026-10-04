import { getAuthUser } from '@/lib/authStore';
import type { FlossApi } from './FlossApi';
import { createLiveApi } from './live';
import { createMockApi } from './mock';

/** VITE_DATA_MODE=live switches every screen to the backend with no other code change. */
const live = import.meta.env.VITE_DATA_MODE === 'live';
export const api: FlossApi = live ? createLiveApi(import.meta.env.VITE_API_BASE_URL ?? '') : createMockApi(getAuthUser);
export { FlossApiError } from './FlossApi';
export type { FlossApi } from './FlossApi';
