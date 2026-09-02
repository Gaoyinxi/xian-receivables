'use client';

import { AccountIdentity } from '@/components/receivables/account-context';
import { CircleDollarSign, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { cn } from '@/lib/utils';
import type { BootstrapData, Role } from '@/lib/types';
import { roleLabels } from '@/lib/presentation';
import {
  NAV_GROUPS,
  VIEW_TITLES,
  type WorkspaceRoute,
} from '@/lib/project-navigation';

export function IdentityControls({
  data,
  onChange,
  compact = false,
}: {
  data: BootstrapData;
  onChange: (role: Role, districtCode?: string | null) => void;
  compact?: boolean;
}) {
  if (data.session.authMode === 'PASSWORD') {
    return (
      <AccountIdentity
        name={data.session.displayName}
        role={roleLabels[data.session.role]}
      />
    );
  }
  return (
    <>
      <span
        className={cn(
          'text-muted-foreground',
          compact ? 'text-[10px]' : 'pl-1 text-[11px]',
        )}
      >
        演示身份
      </span>
      <NativeSelect
        aria-label="切换演示角色"
        size="sm"
        className={compact ? 'min-w-[112px]' : 'min-w-[126px]'}
        value={data.session.role}
        onChange={(event) =>
          onChange(
            event.target.value as Role,
            event.target.value === 'CITY_ADMIN'
              ? null
              : (data.session.districtCode ?? 'BEILIN'),
          )
        }
      >
        {Object.entries(roleLabels).map(([role, label]) => (
          <NativeSelectOption key={role} value={role}>
            {label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {data.session.role !== 'CITY_ADMIN' ? (
        <NativeSelect
          aria-label="切换区县"
          size="sm"
          className={compact ? 'min-w-[84px]' : 'min-w-[92px]'}
          value={data.session.districtCode ?? 'BEILIN'}
          onChange={(event) => onChange(data.session.role, event.target.value)}
        >
          {data.districts.map((district) => (
            <NativeSelectOption key={district.id} value={district.code}>
              {district.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      ) : null}
    </>
  );
}

export function ApplicationHeader({
  data,
  refreshing,
  onRefresh,
  onChangeIdentity,
  route,
  children,
}: {
  data: BootstrapData;
  refreshing: boolean;
  onRefresh: () => void;
  onChangeIdentity: (role: Role, districtCode?: string | null) => void;
  route: WorkspaceRoute;
  children?: React.ReactNode;
}) {
  const group = NAV_GROUPS.find((item) =>
    (item.views as readonly string[]).includes(route.view),
  );
  const project = data.projects.find((item) => item.id === route.projectId);
  // The project workspace is intentionally distraction-free: its own page
  // content already identifies the project and scope, so the global context
  // breadcrumb is hidden there.
  const showContext = route.view !== 'projects';
  const buildId = import.meta.env.VITE_BUILD_ID || 'DEV';
  return (
    <header className="app-topbar sticky z-20 flex min-h-14 items-center px-4 md:px-7">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-primary text-white shadow-sm lg:hidden">
          <CircleDollarSign className="size-5" />
        </div>
        <span className="app-build-id" title={`前端构建编号 ${buildId}`}>
          {buildId}
        </span>
        {showContext ? (
          <div className="min-w-0">
            <nav className="app-location" aria-label="当前位置">
              <span>{group?.label}</span>
              <span aria-hidden="true">/</span>
              <strong aria-current="page">
                {project?.name ?? VIEW_TITLES[route.view]}
              </strong>
            </nav>
            <p className="hidden text-xs text-muted-foreground sm:block">
              {data.session.districtName
                ? `${data.session.districtName}数据范围`
                : '全市数据范围'}{' '}
            </p>
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {children}
        <fieldset
          disabled={refreshing}
          className="app-identity-cluster hidden md:flex"
        >
          <IdentityControls data={data} onChange={onChangeIdentity} />
        </fieldset>
        <Button
          variant="ghost"
          size="icon"
          aria-label="刷新数据"
          onClick={onRefresh}
          disabled={refreshing}
          aria-busy={refreshing}
        >
          <RefreshCw className={cn(refreshing && 'animate-spin')} />
        </Button>
        <div
          className="app-avatar size-8 text-xs font-semibold"
          aria-label={`当前身份：${roleLabels[data.session.role]}`}
        >
          {data.session.role === 'CITY_ADMIN'
            ? '市'
            : data.session.districtName?.slice(0, 1)}
        </div>
      </div>
    </header>
  );
}
