import { apiRequest } from '@/lib/api-client';
import type { BootstrapData, Role } from '@/lib/types';

export const workspaceService = {
  read: (signal?: AbortSignal) =>
    apiRequest<BootstrapData>('/api/v1/bootstrap', { signal }),
  changeDemoIdentity: (role: Role, districtCode?: string | null) =>
    apiRequest('/api/v1/session', {
      method: 'POST',
      body: JSON.stringify({ role, districtCode }),
    }),
  confirm: (id: string) =>
    apiRequest('/api/v1/receivables/confirm', {
      method: 'POST',
      body: JSON.stringify({ id }),
    }),
};
