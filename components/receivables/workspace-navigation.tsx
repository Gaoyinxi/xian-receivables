'use client';

import {
  Building2,
  Database,
  FolderKanban,
  LayoutDashboard,
  Settings2,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NAV_GROUPS, VIEW_TITLES, type View } from '@/lib/project-navigation';

const icons = {
  dashboard: LayoutDashboard,
  projects: FolderKanban,
  data: Database,
  system: Settings2,
};
export function WorkspaceNavigation({
  view,
  onNavigate,
  mobile = false,
}: {
  view: View;
  onNavigate: (view: View) => void;
  mobile?: boolean;
}) {
  const group =
    NAV_GROUPS.find((g) => (g.views as readonly string[]).includes(view)) ??
    NAV_GROUPS[0];
  const items = NAV_GROUPS.map((item) => {
    const Icon = icons[item.id];
    return (
      <button
        key={item.id}
        type="button"
        className={mobile ? 'lc-mobile-link' : 'app-sidebar-link'}
        data-active={item.id === group.id}
        aria-current={item.id === group.id ? 'page' : undefined}
        onClick={() => onNavigate(item.views[0])}
      >
        <Icon aria-hidden="true" className="size-4" />
        <span>{item.label}</span>
      </button>
    );
  });
  if (mobile)
    return (
      <nav className="lc-mobile-primary lg:hidden" aria-label="主导航">
        {items}
      </nav>
    );
  return (
    <aside className="app-sidebar lc-sidebar fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col lg:flex">
      <div className="lc-brand">
        <Building2 aria-hidden="true" className="size-7" />
        <div>
          <strong>项目应收</strong>
          <span>项目全周期工作空间</span>
        </div>
      </div>
      <nav aria-label="主导航" className="space-y-2 px-3 py-6">
        {items}
      </nav>
      <div className="lc-sidebar-guide">
        <p>从项目开始</p>
        <span>看清当前状态，沿下一步完成确认、跟进与回款。</span>
      </div>
      <div className="lc-sidebar-footer">
        <ShieldCheck aria-hidden="true" className="size-4" />
        <span>按区县授权 · 操作留痕</span>
      </div>
    </aside>
  );
}

export function WorkspaceSubnav({
  view,
  onNavigate,
}: {
  view: View;
  onNavigate: (view: View) => void;
}) {
  const group = NAV_GROUPS.find((g) =>
    (g.views as readonly string[]).includes(view),
  );
  if (!group || group.views.length < 2) return null;
  return (
    <nav className="lc-subnav" aria-label={`${group.label}视图`}>
      {group.views.map((item) => (
        <Button
          key={item}
          size="sm"
          variant="ghost"
          aria-current={view === item ? 'page' : undefined}
          onClick={() => onNavigate(item)}
        >
          {VIEW_TITLES[item]}
        </Button>
      ))}
    </nav>
  );
}
