'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { workspaceService } from '@/services/workspace';
import { LatestRequest } from '@/lib/latest-request';
import { invalidateIdentityRequests } from '@/lib/api-client';
import type { BootstrapData } from '@/lib/types';

export function useWorkspaceData() {
  const [data, setData] = useState<BootstrapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const requests = useRef(new LatestRequest());
  const fetchSnapshot = useCallback(
    async (request: ReturnType<LatestRequest['start']>) => {
      try {
        const next = await workspaceService.read(request.signal);
        if (!request.current()) return;
        setData(next);
        setUpdatedAt(new Date().toISOString());
      } catch (failure) {
        if (request.current())
          setError(
            failure instanceof Error ? failure.message : '数据读取失败，请重试',
          );
      } finally {
        if (request.current()) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [],
  );
  const load = useCallback(
    async (background = false) => {
      setError(null);
      setRefreshing(background);
      if (!background) setLoading(true);
      await fetchSnapshot(requests.current.start());
    },
    [fetchSnapshot],
  );
  const resetIdentity = useCallback(() => {
    requests.current.cancel();
    invalidateIdentityRequests();
    setData(null);
    setUpdatedAt(null);
    setError(null);
    setLoading(true);
  }, []);
  useEffect(() => {
    const owner = requests.current;
    void fetchSnapshot(owner.start());
    return () => owner.cancel();
  }, [fetchSnapshot]);
  return { data, loading, refreshing, error, updatedAt, load, resetIdentity };
}
