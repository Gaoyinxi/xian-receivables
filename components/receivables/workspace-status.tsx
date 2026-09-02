'use client';
import { useEffect, useState } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/presentation';

export function WorkspaceStatus({
  refreshing,
  updatedAt,
  error,
  onRetry,
  hideWhenFresh = false,
}: {
  refreshing: boolean;
  updatedAt: string | null;
  error: string | null;
  onRetry: () => void;
  /** Keep errors and active sync feedback visible while hiding passive chrome. */
  hideWhenFresh?: boolean;
}) {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  if (hideWhenFresh && !offline && !error && !refreshing) {
    return null;
  }
  return (
    <output className="app-sync-status" aria-live="polite">
      {offline && <WifiOff aria-hidden="true" className="size-4" />}
      <span data-stale={Boolean(error) || offline}>
        {offline
          ? '当前离线，仅显示最近读取的数据；请联网后再提交。'
          : error
            ? `刷新失败：${error}。当前显示旧数据。`
            : refreshing
              ? '正在同步最新台账…'
              : updatedAt
                ? `已同步 · ${formatDateTime(updatedAt)}`
                : '等待同步'}
      </span>
      {error && (
        <Button
          variant="ghost"
          size="sm"
          disabled={refreshing}
          onClick={onRetry}
        >
          <RefreshCw aria-hidden="true" />
          重新同步
        </Button>
      )}
    </output>
  );
}

export function WorkspaceSkeleton() {
  return (
    <main
      className="app-loading-screen"
      aria-busy="true"
      aria-label="正在载入应收工作台"
    >
      <div className="app-workspace-skeleton">
        <h1 className="text-lg font-semibold">正在载入应收工作台</h1>
        <output className="text-sm text-muted-foreground">
          正在读取当前账号可见的项目与台账。
        </output>
        <div className="app-workspace-skeleton-grid">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    </main>
  );
}
