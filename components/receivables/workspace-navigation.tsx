'use client';

import { FolderKanban, Plus, Settings2 } from 'lucide-react';
import type { BootstrapData } from '@/lib/types';
import { roleLabels } from '@/lib/presentation';
import { NAV_GROUPS, workspaceUrl, type View } from '@/lib/project-navigation';

const icons = {
  projects: FolderKanban,
  settings: Settings2,
};
export function WorkspaceNavigation({
  view,
  onNavigate,
  mobile = false,
  data,
  onNew,
  onImport,
  onOpen,
}: {
  view: View;
  onNavigate: (view: View) => void;
  mobile?: boolean;
  data?: BootstrapData;
  onNew?: () => void;
  onImport?: () => void;
  onOpen?: (projectId: string, section?: 'overview' | 'audit') => void;
}) {
  const group =
    NAV_GROUPS.find((g) => (g.views as readonly string[]).includes(view)) ??
    NAV_GROUPS[0];
  const items = NAV_GROUPS.map((item) => {
    const Icon = icons[item.id];
    return (
      <a
        key={item.id}
        href={workspaceUrl({ view: item.views[0] })}
        className={mobile ? 'lc-mobile-link' : 'app-sidebar-link'}
        data-active={item.id === group.id}
        aria-current={item.id === group.id ? 'page' : undefined}
        onClick={(event) => {
          if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          event.preventDefault();
          onNavigate(item.views[0]);
        }}
      >
        <Icon aria-hidden="true" className="size-4" />
        <span>{item.label}</span>
      </a>
    );
  });
  if (mobile)
    return (
      <nav
        className="lc-mobile-primary app-glass lg:hidden"
        aria-label="主导航"
      >
        {items}
      </nav>
    );
  return (
    <aside className="app-sidebar lc-sidebar app-glass fixed z-30 hidden flex-col lg:flex">
      <div className="lc-brand">
        <span className="lc-brand-mark" aria-hidden="true">
          AR
        </span>
        <div>
          <strong>项目应收</strong>
        </div>
      </div>
      {data?.session.role === 'CITY_ADMIN' && onNew ? (
        <button type="button" className="lc-sidebar-new" onClick={onNew}>
          <span>新建项目</span>
          <Plus aria-hidden="true" className="size-4" />
        </button>
      ) : null}
      <nav
        aria-label="主导航"
        className="lc-sidebar-nav lc-approved-sidebar-nav"
      >
        {!data ? (
          items
        ) : (
          <>
            <button
              type="button"
              className="app-sidebar-link"
              data-active={view === 'projects' || view === 'history'}
              aria-current={
                view === 'projects' || view === 'history' ? 'page' : undefined
              }
              onClick={() => onNavigate('projects')}
            >
              <span>所有项目</span>
            </button>
            <button
              type="button"
              className="app-sidebar-link"
              onClick={onImport}
            >
              <span>导入</span>
            </button>
            <button
              type="button"
              className="app-sidebar-link"
              disabled={!data?.projects.length}
              onClick={() =>
                data?.projects[0] && onOpen?.(data.projects[0].id, 'audit')
              }
            >
              <span>审计</span>
            </button>
            <button
              type="button"
              className="app-sidebar-link lc-sidebar-settings-link"
              data-active={view === 'account'}
              aria-current={view === 'account' ? 'page' : undefined}
              onClick={() => onNavigate('account')}
            >
              <span>设置</span>
            </button>
          </>
        )}
      </nav>
      <div className="lc-sidebar-footer">
        {data ? (
          <div className="lc-sidebar-profile">
            <b aria-hidden="true">{data.session.displayName.slice(0, 1)}</b>
            <span>
              <strong>{data.session.displayName}</strong>
              <small>{roleLabels[data.session.role]}</small>
            </span>
          </div>
        ) : (
          <span>西安市 · 项目应收工作空间</span>
        )}
      </div>
    </aside>
  );
}
