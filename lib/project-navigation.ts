export const VIEW_TITLES = {
  dashboard: '业务驾驶舱',
  projects: '项目',
  receivables: '应收总览',
  receipts: '回款流水',
  collections: '催缴查询',
  imports: '数据导入',
  audit: '审计查询',
  risk: '风险规则',
  history: '历史项目',
  'risk-analysis': '风险分析',
  account: '账号与权限',
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
export type WorkspaceRoute = {
  view: View;
  projectId?: string;
  section?: ProjectSection;
  receivableId?: string;
};
export const NAV_GROUPS = [
  { id: 'dashboard', label: '工作台', views: ['dashboard'] },
  { id: 'projects', label: '项目', views: ['projects', 'history'] },
  {
    id: 'data',
    label: '数据中心',
    views: ['receivables', 'receipts', 'collections', 'risk-analysis', 'audit'],
  },
  { id: 'system', label: '系统管理', views: ['imports', 'risk', 'account'] },
] as const;

export function parseWorkspaceHash(hash: string): WorkspaceRoute {
  try {
    const [path, query = ''] = hash.replace(/^#/, '').split('?');
    const [view, projectId, section = 'overview'] = path
      .split('/')
      .map(decodeURIComponent);
    if (!Object.hasOwn(VIEW_TITLES, view)) return { view: 'dashboard' };
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
    return { view: 'dashboard' };
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
