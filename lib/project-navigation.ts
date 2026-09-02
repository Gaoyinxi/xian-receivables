export const VIEW_TITLES = {
  dashboard: '项目总览',
  projects: '项目总览',
  history: '历史项目',
  account: '设置',
} as const;
export type View = keyof typeof VIEW_TITLES;
export const PROJECT_SECTIONS = {
  overview: '生命周期',
  contract: '合同与附件',
  receivables: '付款节点',
  collections: '催收跟进',
  receipts: '回款与核销',
  risk: '风险解释',
  audit: '审计记录',
} as const;
export type ProjectSection = keyof typeof PROJECT_SECTIONS;
// Presentation groups only: section URLs and business permissions stay intact.
export const PROJECT_SECTION_GROUPS = [
  { id: 'overview', label: '动态', sections: ['overview'] },
  {
    id: 'receivables',
    label: '款项',
    sections: ['receivables', 'receipts', 'collections'],
  },
  { id: 'contract', label: '资料', sections: ['contract', 'risk', 'audit'] },
] as const;
export type WorkspaceRoute = {
  view: View;
  projectId?: string;
  section?: ProjectSection;
  receivableId?: string;
  newProject?: boolean;
  importing?: boolean;
  notFound?: boolean;
};
export const NAV_GROUPS = [
  {
    id: 'projects',
    label: '项目总览',
    views: ['dashboard', 'projects', 'history'],
  },
  { id: 'settings', label: '设置', views: ['account'] },
] as const;

function decodePathSegment(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    if (
      !decoded ||
      decoded === '.' ||
      decoded === '..' ||
      decoded.startsWith('.') ||
      decoded.includes('/') ||
      decoded.includes('\\') ||
      decoded.includes('\0')
    )
      return null;
    return decoded;
  } catch {
    return null;
  }
}

function notFoundRoute(): WorkspaceRoute {
  return { view: 'projects', notFound: true };
}

export function parseWorkspaceLocation(
  pathname: string,
  search = '',
): WorkspaceRoute {
  if (!pathname.startsWith('/') || pathname.includes('//'))
    return notFoundRoute();
  const normalized = pathname !== '/' ? pathname.replace(/\/$/, '') : '/';
  if (normalized === '/') return { view: 'projects' };
  const raw = normalized.slice(1).split('/');
  const parts = raw.map(decodePathSegment);
  if (parts.some((part) => part === null)) return notFoundRoute();
  const [root, second, third] = parts as string[];

  if (root === 'projects') {
    if (parts.length === 1) {
      const query = new URLSearchParams(search);
      if (query.get('scope') === 'history') return { view: 'history' };
      return query.get('tool') === 'import'
        ? { view: 'projects', importing: true }
        : { view: 'projects' };
    }
    if (second === 'new')
      return parts.length === 2
        ? { view: 'projects', newProject: true }
        : notFoundRoute();
    if (parts.length > 3) return notFoundRoute();
    const section = third ?? 'overview';
    if (!Object.hasOwn(PROJECT_SECTIONS, section)) return notFoundRoute();
    const receivableId = new URLSearchParams(search).get('node') || undefined;
    return {
      view: 'projects',
      projectId: second,
      section: section as ProjectSection,
      ...(receivableId ? { receivableId } : {}),
    };
  }
  if (root === 'settings' && parts.length === 1) return { view: 'account' };
  return notFoundRoute();
}

export function workspaceUrl(route: WorkspaceRoute): string {
  if (route.notFound) return '/';
  if (route.view === 'dashboard') return '/projects';
  if (route.view === 'history') return '/projects?scope=history';
  if (route.view === 'projects') {
    if (route.importing) return '/projects?tool=import';
    if (route.newProject) return '/projects/new';
    if (!route.projectId) return '/projects';
    const section = route.section ?? 'overview';
    const base = `/projects/${encodeURIComponent(route.projectId)}${
      section === 'overview' ? '' : `/${section}`
    }`;
    return route.receivableId
      ? `${base}?node=${encodeURIComponent(route.receivableId)}`
      : base;
  }
  return route.view === 'account' ? '/settings' : '/';
}

export function isWorkspaceDocumentPath(pathname: string): boolean {
  return !parseWorkspaceLocation(pathname).notFound;
}

export function parseWorkspaceHash(hash: string): WorkspaceRoute {
  try {
    const [path, query = ''] = hash.replace(/^#/, '').split('?');
    const [view, projectId, section = 'overview'] = path
      .split('/')
      .map(decodeURIComponent);
    if (!Object.hasOwn(VIEW_TITLES, view)) return { view: 'projects' };
    if (view === 'projects' && projectId) {
      return {
        view,
        projectId,
        section: Object.hasOwn(PROJECT_SECTIONS, section)
          ? (section as ProjectSection)
          : 'overview',
        receivableId: new URLSearchParams(query).get('node') || undefined,
      };
    }
    return { view: view as View };
  } catch {
    return { view: 'projects' };
  }
}

export function legacyWorkspaceRoute(
  pathname: string,
  hash: string,
): WorkspaceRoute | null {
  if (pathname !== '/' || !hash.startsWith('#')) return null;
  const value = hash.slice(1);
  if (!value || value === 'main-content') return null;
  try {
    const root = decodeURIComponent(value.split(/[/?]/, 1)[0]);
    if (!Object.hasOwn(VIEW_TITLES, root)) return null;
    return parseWorkspaceHash(value);
  } catch {
    return null;
  }
}

export function projectHash(
  projectId: string,
  section: ProjectSection = 'overview',
  receivableId?: string,
): string {
  return `projects/${encodeURIComponent(projectId)}/${section}${receivableId ? `?node=${encodeURIComponent(receivableId)}` : ''}`;
}

// Explicit context must never fall back to another project or financial record.
export function contextualCandidates<
  T extends { id: string; projectId: string },
>(rows: T[], projectId?: string | null, receivableId?: string | null): T[] {
  return rows.filter(
    (row) =>
      (!projectId || row.projectId === projectId) &&
      (!receivableId || row.id === receivableId),
  );
}
