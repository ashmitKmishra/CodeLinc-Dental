import { getAuthUser } from '@/lib/authStore';
import type { FlossApi } from './FlossApi';
import { createLiveApi, createCognitoAuth, toAuthUser } from './live';
import { createMockApi } from './mock';

/** VITE_DATA_MODE=live switches every screen to the backend with no other code change. */
export const isLive = import.meta.env.VITE_DATA_MODE === 'live';
const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '';
export const api: FlossApi = isLive ? createLiveApi(baseUrl) : createMockApi(getAuthUser);
/** Phone + password sign-in with Amazon Cognito. */
export const liveAuth = createCognitoAuth(baseUrl);
export { toAuthUser };
export { FlossApiError } from './FlossApi';
export type { FlossApi } from './FlossApi';
