import { apiRequest } from '@/lib/api-client';
import type { DemoSession } from '@/lib/types';

export interface AuthState {
  session: DemoSession | null;
  csrfToken: string | null;
}
export const authService = {
  session: () => apiRequest<AuthState>('/api/v1/auth/session'),
  login: (input: Record<string, unknown>) =>
    apiRequest<AuthState>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  password: (input: Record<string, unknown>) =>
    apiRequest<AuthState>('/api/v1/auth/password', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  logout: () =>
    apiRequest<{ signedOut: boolean }>('/api/v1/auth/logout', {
      method: 'POST',
      body: '{}',
    }),
};
