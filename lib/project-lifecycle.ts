import {
  canConfirmReceivable,
  canCreateOperationalRecord,
  canManageReceivable,
  daysBetween,
} from './domain';
import type {
  AttachmentRecord,
  AuditRecord,
  BootstrapData,
  CollectionRecord,
  DemoSession,
  ProjectRecord,
  ReceiptRecord,
  ReceivableRecord,
  RiskLevel,
} from './types';
import type { ProjectSection } from './project-navigation';

export const FOLLOWUP_DAYS = 30;
export const UPCOMING_DAYS = 7;
export const STAGES = {
  SETUP: '待建付款节点',
  PENDING: '待确认',
  NORMAL: '正常应收',
  DUE: '即将到期',
  OVERDUE: '已逾期',
  COLLECTING: '催收中',
  PARTIAL: '部分回款',
  SETTLED: '已结清',
  REVIEW: '待核对',
} as const;
export type ProjectStage = keyof typeof STAGES;
export type NextAction = {
  kind: 'node' | 'confirm' | 'collection' | 'receipt' | 'view';
  label: string;
  reason: string;
  section: ProjectSection;
  receivableId?: string;
  responsible: string;
};
export type ProjectModel = {
  project: ProjectRecord;
  nodes: ReceivableRecord[];
  receipts: ReceiptRecord[];
  collections: CollectionRecord[];
  attachments: AttachmentRecord[];
  audits: AuditRecord[];
  formed: number;
  confirmed: number;
  draft: number;
  received: number;
  remaining: number;
  overdue: number;
  monthly: number;
  risk: RiskLevel;
  stage: ProjectStage;
  drafts: ReceivableRecord[];
  open: ReceivableRecord[];
  overdueNodes: ReceivableRecord[];
  lastActivity: string;
  next: NextAction;
  badges: string[];
};
export type ProjectTask = {
  projectId: string;
  projectName: string;
  districtName: string;
  node?: ReceivableRecord;
  reasons: string[];
  priority: number;
  next: NextAction;
  relatedCount: number;
};

export function shanghaiDate(now = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function money(cents: number): string {
  return `¥${(cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function dateTime(value?: string | null): string {
  if (!value) return '时间未提供';
  return value.length === 10
    ? value
    : new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(value));
}
export function followupGap(node: ReceivableRecord, today: string): number {
  return Math.max(
    0,
    daysBetween(node.latestCollectionDate ?? node.dueDate, today),
  );
}
export function needsFollowup(node: ReceivableRecord, today: string): boolean {
  return (
    node.confirmationStatus === 'CONFIRMED' &&
    node.remainingAmountCents > 0 &&
    node.dueDate <= today &&
    followupGap(node, today) >= FOLLOWUP_DAYS
  );
}
function compareNodes(a: ReceivableRecord, b: ReceivableRecord): number {
  return (
    b.overdueDays - a.overdueDays ||
    a.dueDate.localeCompare(b.dueDate) ||
    a.sequenceNo - b.sequenceNo ||
    a.id.localeCompare(b.id)
  );
}
export function nextForNode(
  node: ReceivableRecord,
  session: DemoSession,
): NextAction {
  const canOperate = canCreateOperationalRecord(
    session.role,
    session.districtId,
    node.districtId,
  );
  const base = { receivableId: node.id, responsible: '本区业务人员' };
  if (node.confirmationStatus === 'DRAFT')
    return {
      ...base,
      kind: canConfirmReceivable(session.role) ? 'confirm' : 'view',
      label: canConfirmReceivable(session.role) ? '确认应收' : '查看待确认节点',
      section: 'receivables',
      reason: '此节点尚未确认，确认后才能登记回款。',
      responsible: '市级管理员',
    };
  if (node.remainingAmountCents > 0 && node.overdueDays > 0)
    return {
      ...base,
      kind: canOperate ? 'collection' : 'view',
      label: canOperate ? '登记催收' : '查看逾期节点',
      section: 'collections',
      reason: `已逾期 ${node.overdueDays} 天，仍有 ${money(node.remainingAmountCents)} 未收回。`,
    };
  return {
    ...base,
    kind: node.remainingAmountCents > 0 && canOperate ? 'receipt' : 'view',
    label:
      node.remainingAmountCents <= 0
        ? '查看核销记录'
        : !canOperate
          ? '查看回款节点'
          : node.receivedAmountCents > 0
            ? '登记下一笔回款'
            : '登记实际回款',
    section: 'receipts',
    reason:
      node.remainingAmountCents > 0
        ? `约定 ${node.dueDate} 回款；实际到账后登记，核销自动完成。`
        : '本节点已结清，原流水和更正记录继续保留。',
  };
}

function grouped<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const group = result.get(k) ?? [];
    group.push(row);
    result.set(k, group);
  }
  return result;
}

// A read model only. Persisted financial state and server risk rules remain authoritative.
export function buildPortfolio(
  data: BootstrapData,
  today = data.businessDate ?? shanghaiDate(),
): ProjectModel[] {
  const byProject = grouped(data.receivables, (r) => r.projectId);
  const nodeProject = new Map(data.receivables.map((r) => [r.id, r.projectId]));
  const receipts = grouped(
    data.receipts,
    (r) => nodeProject.get(r.receivableId) ?? '',
  );
  const collections = grouped(
    data.collections,
    (r) => nodeProject.get(r.receivableId) ?? '',
  );
  const attachments = grouped(data.attachments, (a) =>
    a.entityType === 'PROJECT'
      ? a.entityId
      : (nodeProject.get(a.entityId) ?? ''),
  );
  const entityProject = new Map<string, string>();
  for (const p of data.projects) entityProject.set(`PROJECT:${p.id}`, p.id);
  for (const r of data.receivables)
    entityProject.set(`RECEIVABLE:${r.id}`, r.projectId);
  for (const r of data.receipts)
    entityProject.set(`RECEIPT:${r.id}`, nodeProject.get(r.receivableId) ?? '');
  for (const c of data.collections)
    entityProject.set(
      `COLLECTION:${c.id}`,
      nodeProject.get(c.receivableId) ?? '',
    );
  for (const a of data.attachments)
    entityProject.set(
      `ATTACHMENT:${a.id}`,
      a.entityType === 'PROJECT'
        ? a.entityId
        : (nodeProject.get(a.entityId) ?? ''),
    );
  const audits = grouped(
    data.auditLogs,
    (a) => entityProject.get(`${a.entityType}:${a.entityId}`) ?? '',
  );
  return data.projects.map((project) => {
    const nodes = (byProject.get(project.id) ?? []).toSorted(
      (a, b) => a.sequenceNo - b.sequenceNo || a.id.localeCompare(b.id),
    );
    const confirmedNodes = nodes.filter(
      (r) => r.confirmationStatus === 'CONFIRMED',
    );
    const drafts = nodes.filter((r) => r.confirmationStatus === 'DRAFT');
    const open = confirmedNodes
      .filter((r) => r.remainingAmountCents > 0)
      .toSorted(compareNodes);
    const overdueNodes = open.filter((r) => r.overdueDays > 0);
    const projectReceipts = receipts.get(project.id) ?? [];
    const projectCollections = collections.get(project.id) ?? [];
    const projectAttachments = attachments.get(project.id) ?? [];
    const projectAudits = audits.get(project.id) ?? [];
    const confirmedIds = new Set(confirmedNodes.map((r) => r.id));
    const received = projectReceipts
      .filter((r) => r.status === 'VALID' && confirmedIds.has(r.receivableId))
      .reduce((sum, r) => sum + r.amountCents, 0);
    const risk: RiskLevel = open.some((r) => r.riskLevel === 'RED')
      ? 'RED'
      : open.some((r) => r.riskLevel === 'YELLOW')
        ? 'YELLOW'
        : open.some((r) => r.riskLevel === 'BLUE')
          ? 'BLUE'
          : 'NONE';
    const settled =
      nodes.length > 0 &&
      nodes.every(
        (r) =>
          r.confirmationStatus === 'CONFIRMED' &&
          r.writeoffStatus === 'PAID' &&
          r.remainingAmountCents === 0,
      );
    const stage: ProjectStage = overdueNodes.length
      ? 'OVERDUE'
      : open.length && received > 0
        ? 'PARTIAL'
        : open.some((r) => daysBetween(today, r.dueDate) <= UPCOMING_DAYS)
          ? 'DUE'
          : open.length
            ? 'NORMAL'
            : drafts.length
              ? 'PENDING'
              : settled
                ? 'SETTLED'
                : !nodes.length
                  ? 'SETUP'
                  : 'REVIEW';
    const target =
      overdueNodes[0] ?? drafts.toSorted(compareNodes)[0] ?? open[0];
    const canNode = canManageReceivable(
      data.session.role,
      data.session.districtId,
      project.districtId,
    );
    const next: NextAction = target
      ? nextForNode(target, data.session)
      : !nodes.length
        ? {
            kind: canNode ? 'node' : 'view',
            label: canNode ? '新增付款节点' : '查看合同资料',
            section: canNode ? 'receivables' : 'contract',
            reason: '合同已登记，尚未建立付款计划。',
            responsible: '市级或本区管理员',
          }
        : {
            kind: 'view',
            label: '查看结清记录',
            section: 'receipts',
            reason: '已形成应收全部结清；财务归档不等于合同履行完毕。',
            responsible: '系统自动核销',
          };
    const hasCollection = open.some((r) => r.latestCollectionDate);
    const badges = [
      ...(drafts.length ? [`${drafts.length} 笔待确认`] : []),
      ...(hasCollection ? ['催收中'] : []),
      ...(received > 0 && open.length ? ['已有回款'] : []),
      ...(project.archivedAt ? ['财务已归档'] : []),
    ];
    const times = [
      project.createdAt,
      project.updatedAt,
      ...nodes.flatMap((r) => [r.createdAt, r.confirmedAt, r.updatedAt]),
      ...projectReceipts.flatMap((r) => [r.createdAt, r.voidedAt]),
      ...projectCollections.flatMap((r) => [r.createdAt, r.voidedAt]),
      ...projectAttachments.map((a) => a.createdAt),
      ...projectAudits.map((a) => a.createdAt),
    ].filter((v): v is string => Boolean(v));
    return {
      project,
      nodes,
      receipts: projectReceipts,
      collections: projectCollections,
      attachments: projectAttachments,
      audits: projectAudits,
      drafts,
      open,
      overdueNodes,
      formed: nodes.reduce((s, r) => s + r.amountCents, 0),
      confirmed: confirmedNodes.reduce((s, r) => s + r.amountCents, 0),
      draft: drafts.reduce((s, r) => s + r.amountCents, 0),
      received,
      remaining: open.reduce((s, r) => s + r.remainingAmountCents, 0),
      overdue: overdueNodes.reduce((s, r) => s + r.remainingAmountCents, 0),
      monthly: open
        .filter((r) => r.dueDate.slice(0, 7) === today.slice(0, 7))
        .reduce((s, r) => s + r.remainingAmountCents, 0),
      risk,
      stage,
      lastActivity: times.toSorted().at(-1) ?? project.createdAt,
      next,
      badges,
    };
  });
}

export function projectMatchesStage(
  model: ProjectModel,
  stage: ProjectStage,
): boolean {
  // Signals intentionally overlap: filtering for collection never hides overdue risk.
  if (stage === 'COLLECTING')
    return model.open.some((r) => Boolean(r.latestCollectionDate));
  if (stage === 'PENDING') return model.drafts.length > 0;
  if (stage === 'PARTIAL') return model.received > 0 && model.open.length > 0;
  return model.stage === stage;
}

export function buildTaskQueue(
  models: ProjectModel[],
  session: DemoSession,
  today: string,
): ProjectTask[] {
  const tasks: ProjectTask[] = [];
  for (const model of models) {
    if (!model.nodes.length) {
      tasks.push({
        projectId: model.project.id,
        projectName: model.project.name,
        districtName: model.project.districtName,
        reasons: ['尚未建立付款计划'],
        priority: 4,
        next: model.next,
        relatedCount: 0,
      });
    }
    const candidates = model.nodes
      .flatMap((node) => {
        const draft = node.confirmationStatus === 'DRAFT';
        const open = !draft && node.remainingAmountCents > 0;
        const due = open && node.dueDate === today;
        const upcoming =
          open &&
          node.dueDate > today &&
          daysBetween(today, node.dueDate) <= UPCOMING_DAYS;
        const stale = needsFollowup(node, today);
        const overdue = open && node.overdueDays > 0;
        if (!draft && !due && !upcoming && !overdue && !stale) return [];
        const reasons = [
          ...(draft ? ['应收待确认'] : []),
          ...(overdue ? [`逾期 ${node.overdueDays} 天`] : []),
          ...(due ? ['今天到期'] : []),
          ...(upcoming ? [`${daysBetween(today, node.dueDate)} 天后到期`] : []),
          ...(stale
            ? [
                node.latestCollectionDate
                  ? `${followupGap(node, today)} 天无有效跟进记录`
                  : `逾期满 ${FOLLOWUP_DAYS} 天且无跟进记录`,
              ]
            : []),
        ];
        return [
          {
            projectId: model.project.id,
            projectName: model.project.name,
            districtName: model.project.districtName,
            node,
            reasons,
            priority: overdue ? 0 : draft ? 1 : due ? 2 : 3,
            next: nextForNode(node, session),
            relatedCount: 0,
          },
        ];
      })
      .sort((a, b) => a.priority - b.priority || compareNodes(a.node, b.node));
    if (candidates[0])
      tasks.push({ ...candidates[0], relatedCount: candidates.length - 1 });
  }
  return tasks.sort(
    (a, b) =>
      a.priority - b.priority ||
      (a.node && b.node
        ? compareNodes(a.node, b.node)
        : a.projectId.localeCompare(b.projectId)),
  );
}
