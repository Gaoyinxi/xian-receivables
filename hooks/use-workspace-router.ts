'use client';

import * as React from 'react';
import {
  legacyWorkspaceRoute,
  parseWorkspaceLocation,
  workspaceUrl,
  type WorkspaceRoute,
} from '@/lib/project-navigation';

type NavigationMode = 'push' | 'replace';

function currentBrowserRoute(): WorkspaceRoute {
  const legacy = legacyWorkspaceRoute(
    window.location.pathname,
    window.location.hash,
  );
  return (
    legacy ??
    parseWorkspaceLocation(window.location.pathname, window.location.search)
  );
}

export function useWorkspaceRouter(initialRoute?: WorkspaceRoute) {
  const [route, setRoute] = React.useState<WorkspaceRoute>(() => {
    if (initialRoute) return initialRoute;
    return typeof window === 'undefined'
      ? { view: 'projects' }
      : currentBrowserRoute();
  });

  const commit = React.useCallback(
    (
      next: WorkspaceRoute,
      mode: NavigationMode = 'push',
      state: Record<string, unknown> = {},
    ) => {
      const url = workspaceUrl(next);
      const nextState = { ...window.history.state, ...state, workspace: next };
      const update = () => {
        window.history[mode === 'replace' ? 'replaceState' : 'pushState'](
          nextState,
          '',
          url,
        );
        setRoute(next);
      };
      const transitionDocument = document as Document & {
        startViewTransition?: (callback: () => void) => unknown;
      };
      if (
        transitionDocument.startViewTransition &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      )
        transitionDocument.startViewTransition(update);
      else update();
    },
    [],
  );

  React.useEffect(() => {
    let active = true;
    const sync = () => setRoute(currentBrowserRoute());
    const legacy = legacyWorkspaceRoute(
      window.location.pathname,
      window.location.hash,
    );
    const current = legacy ?? currentBrowserRoute();
    const canonical = workspaceUrl(current);
    const actual = `${window.location.pathname}${window.location.search}`;
    if (!current.notFound && (legacy || actual !== canonical))
      window.history.replaceState(
        { ...window.history.state, workspace: current },
        '',
        canonical,
      );
    queueMicrotask(() => {
      if (active) setRoute(current);
    });
    window.addEventListener('popstate', sync);
    return () => {
      active = false;
      window.removeEventListener('popstate', sync);
    };
  }, []);

  return {
    route,
    pushRoute: React.useCallback(
      (next: WorkspaceRoute, state?: Record<string, unknown>) =>
        commit(next, 'push', state),
      [commit],
    ),
    replaceRoute: React.useCallback(
      (next: WorkspaceRoute, state?: Record<string, unknown>) =>
        commit(next, 'replace', state),
      [commit],
    ),
  };
}
