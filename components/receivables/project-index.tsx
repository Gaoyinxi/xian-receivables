'use client';

import { useMemo, useState, type SubmitEvent } from 'react';
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  FileText,
  Paperclip,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { money, nextForNode, type ProjectModel } from '@/lib/project-lifecycle';
import { type OpenProject } from './project-primitives';
import type { ProjectSection } from '@/lib/project-navigation';
import type { DemoSession } from '@/lib/types';
import { canManageProject } from '@/lib/domain';
import { uploadAttachment } from '@/services/attachments';
import { ErrorText, FormField } from './design-system';

type TaskState = 'done' | 'current' | 'future';
type TaskEvent = {
  id: string;
  label: string;
  state: TaskState;
  date: string;
  description: string;
  section: ProjectSection;
};
type ProjectAction = (model: ProjectModel, nodeId?: string) => void;

const STATE_GROUPS = [
  {
    id: 'attention',
    label: '需要处理',
    note: '等待确认、逾期或需要跟进',
    tone: 'attention',
  },
  { id: 'active', label: '进行中', note: '正在按付款计划推进', tone: 'active' },
  { id: 'settled', label: '已结清', note: '应收已完成核销', tone: 'settled' },
] as const;
type StateGroupId = (typeof STATE_GROUPS)[number]['id'];

function stateGroup(model: ProjectModel): StateGroupId {
  if (model.stage === 'SETTLED') return 'settled';
  if (
    model.stage === 'OVERDUE' ||
    model.stage === 'PENDING' ||
    model.next.kind === 'confirm' ||
    model.next.kind === 'collection'
  )
    return 'attention';
  return 'active';
}

function projectNodeDate(model: ProjectModel) {
  const nextNode =
    model.nodes.find((node) => node.id === model.next.receivableId) ??
    model.nodes.find((node) => node.remainingAmountCents > 0) ??
    model.nodes.at(-1);
  return nextNode?.dueDate ?? model.lastActivity.slice(0, 10);
}

function eventsForNode(
  model: ProjectModel,
  node: ProjectModel['nodes'][number],
): TaskEvent[] {
  const isCurrentNode = node.id === model.next.receivableId;
  const currentSection = isCurrentNode ? model.next.section : null;
  const dueReached = node.overdueDays > 0 || Boolean(node.latestCollectionDate);
  const base: TaskEvent[] = [
    {
      id: 'formed',
      label: '应收产生',
      state: 'done',
      date: node.createdAt.slice(0, 10),
      description: '付款节点已形成应收记录。',
      section: 'receivables',
    },
    {
      id: 'confirmed',
      label: '应收确认',
      state: node.confirmationStatus === 'CONFIRMED' ? 'done' : 'future',
      date: node.confirmedAt?.slice(0, 10) ?? node.dueDate,
      description:
        node.confirmationStatus === 'CONFIRMED'
          ? '市级已确认，应收可以进入后续处理。'
          : '等待市级管理员确认应收。',
      section: 'receivables',
    },
    {
      id: 'due',
      label: '到期',
      state: dueReached ? 'done' : 'future',
      date: node.dueDate,
      description: '按合同账期计算的约定付款日期。',
      section: 'receivables',
    },
    {
      id: 'collection',
      label: '催缴',
      state: node.latestCollectionDate ? 'done' : 'future',
      date: node.latestCollectionDate ?? node.dueDate,
      description: node.latestCollectionDate
        ? `最近一次催缴：${node.latestCollectionDate}`
        : '逾期或需要跟进时登记催缴。',
      section: 'collections',
    },
    {
      id: 'receipt',
      label: '回款',
      state: node.remainingAmountCents === 0 ? 'done' : 'future',
      date:
        node.remainingAmountCents === 0
          ? (node.updatedAt?.slice(0, 10) ?? node.dueDate)
          : node.dueDate,
      description:
        node.remainingAmountCents === 0
          ? '本节点已核销完成。'
          : '登记到账后，系统自动计算剩余应收。',
      section: 'receipts',
    },
  ];
  const currentIndex =
    currentSection === 'collections'
      ? 3
      : currentSection === 'receipts'
        ? 4
        : currentSection === 'receivables'
          ? node.confirmationStatus === 'DRAFT'
            ? 1
            : 2
          : -1;
  if (currentIndex >= 0)
    base[currentIndex] = {
      ...base[currentIndex],
      ...(currentSection === 'collections' && node.latestCollectionDate
        ? { label: '再次催缴' }
        : {}),
      state: 'current',
      description: model.next.reason,
    };
  return base;
}

function TaskTree({
  model,
  node,
  expandedTaskIds,
  onExpand,
  onAction,
}: {
  model: ProjectModel;
  node: ProjectModel['nodes'][number];
  expandedTaskIds: Set<string>;
  onExpand: (taskId: string) => void;
  onAction?: ProjectAction;
}) {
  return (
    <ol className="lc-task-tree" aria-label={`${node.paymentType}业务事件`}>
      {eventsForNode(model, node).map((event) => {
        const taskId = `${node.id}:${event.id}`;
        const expanded = expandedTaskIds.has(taskId);
        return (
          <li key={taskId} data-state={event.state} data-expanded={expanded}>
            <button
              type="button"
              className="lc-task-tree-row"
              aria-label={`${event.label}，${event.date}`}
              aria-expanded={expanded}
              onClick={() => onExpand(taskId)}
            >
              <span className="lc-task-dot" aria-hidden="true">
                {event.state === 'done'
                  ? '✓'
                  : event.state === 'current'
                    ? '✶'
                    : ''}
              </span>
              <span>
                <strong>{event.label}</strong>
                <small>{event.date}</small>
              </span>
              <ChevronRight aria-hidden="true" className="size-3.5" />
            </button>
            {expanded && (
              <section className="lc-task-detail" aria-label={`${event.label}详情`}>
                <p>{event.description}</p>
                <dl>
                  <div><dt>应收编号</dt><dd>{node.receivableCode}</dd></div>
                  <div><dt>待收金额</dt><dd>{money(node.remainingAmountCents)}</dd></div>
                  <div><dt>付款条件</dt><dd>{node.paymentCondition}</dd></div>
                  <div><dt>约定付款日</dt><dd>{node.dueDate}</dd></div>
                  <div>
                    <dt>确认 / 风险</dt>
                    <dd>
                      {node.confirmationStatus === 'CONFIRMED' ? '已确认' : '待市级确认'} ·{' '}
                      {node.overdueDays > 0 ? `逾期 ${node.overdueDays} 天` : '当前无逾期'}
                    </dd>
                  </div>
                </dl>
                {event.id === 'receipt' && (
                  <div className="lc-task-detail-stream">
                    <strong>回款流水</strong>
                    {model.receipts.filter((item) => item.receivableId === node.id).length ? (
                      <ul>{model.receipts.filter((item) => item.receivableId === node.id).map((item) => (
                        <li key={item.id}><span>{item.receivedDate}</span><b>{money(item.amountCents)}</b><small>{item.status === 'VALID' ? '有效' : '已作废'}</small></li>
                      ))}</ul>
                    ) : <span>尚无有效回款记录</span>}
                  </div>
                )}
                {event.id === 'collection' && (
                  <div className="lc-task-detail-stream">
                    <strong>催缴跟进</strong>
                    {model.collections.filter((item) => item.receivableId === node.id).length ? (
                      <ul>{model.collections.filter((item) => item.receivableId === node.id).map((item) => (
                        <li key={item.id}><span>{item.actionDate}</span><b>{item.actionType}</b><small>{item.status === 'VALID' ? '有效' : '已作废'}</small></li>
                      ))}</ul>
                    ) : <span>尚无催缴跟进记录</span>}
                  </div>
                )}
                {event.state === 'current' && onAction && (
                  <div className="lc-task-detail-actions">
                    <Button size="sm" onClick={() => onAction(model, node.id)}>
                      {model.next.label}<ArrowRight aria-hidden="true" />
                    </Button>
                  </div>
                )}
              </section>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function ProjectResources({
  model,
  open,
  onOpenChange,
  session,
  onDone,
}: {
  model: ProjectModel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session?: DemoSession;
  onDone?: (message: string) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const riskReason =
    model.overdue > 0
      ? `当前有 ${money(model.overdue)} 已逾期，系统按服务端风险规则计算为 ${model.risk} 级。`
      : '当前无逾期未收金额。';
  async function upload(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || uploading || !session || !canManageProject(session.role)) return;
    setUploading(true);
    setUploadError(null);
    try {
      await uploadAttachment(file, 'PROJECT', model.project.id);
      setFile(null);
      await onDone?.('合同附件已保存，项目资料已刷新');
    } catch (failure) {
      setUploadError(failure instanceof Error ? failure.message : '上传失败，请重试');
    } finally {
      setUploading(false);
    }
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="lc-project-resources-drawer">
        <SheetHeader>
          <SheetTitle>项目资料</SheetTitle>
          <SheetDescription>
            {model.project.name} · {model.project.projectCode}
          </SheetDescription>
        </SheetHeader>
        <div className="lc-resource-body">
          <section>
              <span className="lc-resource-kicker">
                <FileText aria-hidden="true" />
                合同与项目信息
              </span>
              <h3>{model.project.name}</h3>
              <dl>
                <div>
                  <dt>项目编码</dt>
                  <dd>{model.project.projectCode}</dd>
                </div>
                <div>
                  <dt>合同编码</dt>
                  <dd>{model.project.contractCode}</dd>
                </div>
                <div>
                  <dt>签订日期</dt>
                  <dd>{model.project.contractDate}</dd>
                </div>
                <div>
                  <dt>合同金额</dt>
                  <dd>{money(model.project.contractAmountCents)}</dd>
                </div>
                <div>
                  <dt>客户</dt>
                  <dd>{model.project.customerName}</dd>
                </div>
                <div>
                  <dt>负责人</dt>
                  <dd>{model.project.accountManager}</dd>
                </div>
                <div>
                  <dt>归属区域</dt>
                  <dd>{model.project.districtName}</dd>
                </div>
                <div>
                  <dt>业务状态</dt>
                  <dd>{model.project.status}</dd>
                </div>
              </dl>
              <div className="lc-resource-subsection">
                <span className="lc-resource-kicker">回款概况</span>
                <dl>
                  <div>
                    <dt>已形成应收</dt>
                    <dd>{money(model.confirmed)}</dd>
                  </div>
                  <div>
                    <dt>已回款</dt>
                    <dd>{money(model.received)}</dd>
                  </div>
                  <div>
                    <dt>剩余应收</dt>
                    <dd>{money(model.remaining)}</dd>
                  </div>
                  <div>
                    <dt>付款节点</dt>
                    <dd>{model.nodes.length} 个</dd>
                  </div>
                </dl>
              </div>
              <p className="lc-resource-hint">
                合同、节点、回款和催收记录均已关联到当前项目，可在对应节点卡片中继续处理。
              </p>
          </section>
          <section>
              <span className="lc-resource-kicker">当前风险</span>
              <h3>
                {model.risk === 'RED'
                  ? '高风险'
                  : model.risk === 'YELLOW'
                    ? '中风险'
                    : model.risk === 'BLUE'
                      ? '低风险'
                      : '无风险'}
              </h3>
              <p>{riskReason}</p>
              <dl>
                <div>
                  <dt>逾期金额</dt>
                  <dd>{money(model.overdue)}</dd>
                </div>
                <div>
                  <dt>待收金额</dt>
                  <dd>{money(model.remaining)}</dd>
                </div>
                <div>
                  <dt>最近动态</dt>
                  <dd>{model.lastActivity.slice(0, 10)}</dd>
                </div>
              </dl>
          </section>
          <section>
              <span className="lc-resource-kicker">付款节点</span>
              <h3>{model.nodes.length} 个节点</h3>
              <div className="lc-resource-node-list">
                {model.nodes.map((node) => (
                  <article key={node.id}>
                    <div className="lc-resource-node-head">
                      <div>
                        <span>第 {node.sequenceNo} 节 · {node.dueDate}</span>
                        <strong>{node.paymentType}</strong>
                      </div>
                      <b>{money(node.amountCents)}</b>
                    </div>
                    <dl>
                      <div>
                        <dt>应收编号</dt>
                        <dd>{node.receivableCode}</dd>
                      </div>
                      <div>
                        <dt>付款条件</dt>
                        <dd>{node.paymentCondition}</dd>
                      </div>
                      <div>
                        <dt>核销状态</dt>
                        <dd>{node.writeoffStatus === 'PAID' ? '已结清' : node.writeoffStatus === 'PARTIAL' ? '部分回款' : '未回款'}</dd>
                      </div>
                      <div>
                        <dt>剩余应收</dt>
                        <dd>{money(node.remainingAmountCents)}</dd>
                      </div>
                      <div>
                        <dt>确认状态</dt>
                        <dd>{node.confirmationStatus === 'CONFIRMED' ? '已确认' : '待确认'}</dd>
                      </div>
                      <div>
                        <dt>风险</dt>
                        <dd>{node.overdueDays > 0 ? `逾期 ${node.overdueDays} 天` : '当前无逾期'}</dd>
                      </div>
                    </dl>
                    <div className="lc-resource-node-meta">
                      <span>回款 {model.receipts.filter((item) => item.receivableId === node.id && item.status === 'VALID').length} 笔</span>
                      <span>催缴 {model.collections.filter((item) => item.receivableId === node.id && item.status === 'VALID').length} 次</span>
                    </div>
                  </article>
                ))}
              </div>
          </section>
          <section>
              <span className="lc-resource-kicker">
                <Paperclip aria-hidden="true" />
                附件
              </span>
              <h3>{model.attachments.length} 个文件</h3>
              {model.attachments.length ? (
                <ul>
                  {model.attachments.map((file) => (
                    <li key={file.id}>
                      <strong>{file.fileName}</strong>
                      <small>
                        {Math.max(1, Math.round(file.sizeBytes / 1024))} KB ·{' '}
                        {file.createdAt.slice(0, 10)}
                      </small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>尚未上传项目附件。</p>
              )}
              {session && canManageProject(session.role) && onDone ? (
                <form onSubmit={upload} className="lc-resource-upload">
                  <FormField label="上传合同附件" hint="PDF / JPG / PNG，单文件不超过 10MB。">
                    <Input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                      disabled={uploading}
                      onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                    />
                  </FormField>
                  <ErrorText error={uploadError} />
                  <Button type="submit" variant="outline" disabled={uploading || !file} aria-busy={uploading}>
                    {uploading ? '正在上传…' : '上传合同附件'}
                  </Button>
                </form>
              ) : (
                <p className="lc-resource-hint">合同附件由有权限的管理员上传，回款和催缴附件在对应节点中管理。</p>
              )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ProjectPath({
  model,
  onOpen,
  onAction,
  session,
  onDone,
}: {
  model: ProjectModel;
  onOpen: OpenProject;
  onAction?: ProjectAction;
  session?: DemoSession;
  onDone?: (message: string) => Promise<void>;
}) {
  const [showAll, setShowAll] = useState(false);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const currentNode =
    model.nodes.find((node) => node.id === model.next.receivableId) ??
    model.nodes.find((node) => node.remainingAmountCents > 0) ??
    model.nodes.at(-1);
  const visibleNodes = showAll ? model.nodes : currentNode ? [currentNode] : [];
  return (
    <aside
      className="lc-project-preview lc-project-path"
      aria-label={`${model.project.name}当前业务路径`}
    >
      <section className="lc-current-focus" aria-label="当前任务">
        <span className="lc-task-dot" aria-hidden="true">
          ✶
        </span>
        <div>
          <small>当前任务</small>
          <strong>{model.next.label}</strong>
          <p>{model.next.reason}</p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            if (model.next.kind === 'view') setResourcesOpen(true);
            else if (onAction) onAction(model, model.next.receivableId);
            else
              onOpen(
                model.project.id,
                model.next.section,
                model.next.receivableId,
              );
          }}
        >
          {model.next.label}
          <ArrowRight aria-hidden="true" />
        </Button>
      </section>
      <header className="lc-current-path-head">
        <div>
          <span>CURRENT PATH</span>
          <h2>当前业务路径</h2>
          <small className="lc-current-project-name">
            {model.project.name} · {model.project.projectCode}
          </small>
        </div>
        {model.nodes.length > 1 && (
          <button
            type="button"
            className="lc-focus-toggle"
            onClick={() => {
              setShowAll(!showAll);
            }}
          >
            {showAll ? '只看当前路径' : '显示全部节点'}
          </button>
        )}
      </header>
      <div className="lc-path-root">
        <span className="lc-structural-dot" aria-hidden="true" />
        <div>
          <small>合同</small>
          <strong>{model.project.contractCode}</strong>
        </div>
      </div>
      <div className="lc-path-root lc-path-root--receivables">
        <span className="lc-structural-dot" aria-hidden="true" />
        <div>
          <small>应收</small>
          <strong>{model.nodes.length} 个付款节点</strong>
        </div>
      </div>
      {visibleNodes.length ? (
        <ol className="lc-business-path" aria-label="当前付款节点路径">
          {visibleNodes.map((node) => (
            <li key={node.id} data-current={node.id === currentNode?.id}>
              <div className="lc-payment-node-line">
                <button
                  type="button"
                  className="lc-payment-node"
                  onClick={() => setResourcesOpen(true)}
                  aria-label={`查看第 ${node.sequenceNo} 节节点详情`}
                >
                  <span className="lc-payment-node-marker" aria-hidden="true" />
                  <span>
                    <small>
                      第 {node.sequenceNo} 节 · {node.dueDate}
                    </small>
                    <strong>{node.paymentType}</strong>
                  </span>
                  <em>{money(node.remainingAmountCents)}</em>
                  <ChevronRight aria-hidden="true" className="size-4" />
                </button>
                {onAction && session ? (() => {
                  const action = nextForNode(node, session);
                  return (
                    <Button
                      size="sm"
                      variant="outline"
                      className="lc-payment-node-action"
                      onClick={() => {
                        if (action.kind === 'view') setResourcesOpen(true);
                        else onAction(model, node.id);
                      }}
                    >
                      {action.label}
                    </Button>
                  );
                })() : null}
              </div>
              {(node.id === currentNode?.id || showAll) && (
                <TaskTree
                  model={model}
                  node={node}
                  expandedTaskIds={expandedTaskIds}
                  onExpand={(id) =>
                    setExpandedTaskIds((current) => {
                      const next = new Set(current);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    })
                  }
                  onAction={onAction}
                />
              )}
            </li>
          ))}
        </ol>
      ) : (
        <section className="lc-path-empty">
          <strong>尚未建立付款节点</strong>
          <p>先补充付款计划，系统才会生成待确认应收。</p>
          <Button
            size="sm"
            onClick={() => onOpen(model.project.id, 'receivables')}
          >
            建立节点
          </Button>
        </section>
      )}
      {model.nodes.length > 1 && (
        <button
          type="button"
          className="lc-show-all-nodes"
          onClick={() => {
            setShowAll(!showAll);
          }}
        >
          <ChevronDown
            aria-hidden="true"
            className="size-4"
            data-open={showAll}
          />
          {showAll
            ? '只看当前路径'
            : `显示全部节点（其余 ${model.nodes.length - 1} 个已折叠）`}
        </button>
      )}
      <footer className="lc-path-footer">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setResourcesOpen(true)}
        >
          项目资料
        </Button>
      </footer>
      <ProjectResources
        model={model}
        open={resourcesOpen}
        onOpenChange={setResourcesOpen}
        session={session}
        onDone={onDone}
      />
    </aside>
  );
}

export function ProjectIndex({
  models,
  selectedId,
  onSelect,
  onOpen,
  onAction,
  session,
  onDone,
}: {
  models: ProjectModel[];
  selectedId: string | null;
  onSelect: (projectId: string) => void;
  onOpen: OpenProject;
  onAction?: ProjectAction;
  session?: DemoSession;
  onDone?: (message: string) => Promise<void>;
}) {
  const selected = selectedId
    ? (models.find((model) => model.project.id === selectedId) ?? null)
    : null;
  const groups = useMemo(
    () =>
      STATE_GROUPS.map((group) => {
        const rows = models.filter((model) => stateGroup(model) === group.id);
        const districts = new Map<string, ProjectModel[]>();
        for (const row of rows)
          districts.set(row.project.districtName, [
            ...(districts.get(row.project.districtName) ?? []),
            row,
          ]);
        return { ...group, rows, districts: [...districts.entries()] };
      }).filter((group) => group.rows.length),
    [models],
  );
  const [expandedGroups, setExpandedGroups] = useState<Set<StateGroupId>>(
    () =>
      new Set<StateGroupId>([
        groups.find((group) => group.id === 'attention')?.id ?? groups[0]?.id,
      ].filter((id): id is StateGroupId => Boolean(id))),
  );
  const [expandedDistricts, setExpandedDistricts] = useState<Set<string>>(
    () =>
      new Set(
        groups.flatMap((group) =>
          group.districts.map(([districtName]) => `${group.id}:${districtName}`),
        ),
      ),
  );

  const toggleGroup = (groupId: StateGroupId) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };
  const toggleDistrict = (districtId: string) => {
    setExpandedDistricts((current) => {
      const next = new Set(current);
      if (next.has(districtId)) next.delete(districtId);
      else next.add(districtId);
      return next;
    });
  };

  return (
    <section
      className="lc-project-index"
      data-open={Boolean(selected)}
      aria-label="项目索引"
    >
      <div className="lc-project-index-list">
        <ul
          className="lc-state-tree"
          aria-label="按业务状态与区县分组的项目列表"
        >
          {groups.map((group) => {
            const isOpen = expandedGroups.has(group.id);
            return (
              <li
                className="lc-state-group"
                data-tone={group.tone}
                data-open={isOpen}
                key={group.id}
              >
                <button
                  type="button"
                  className="lc-state-toggle"
                  aria-expanded={isOpen}
                  onClick={() => toggleGroup(group.id)}
                >
                  <ChevronDown aria-hidden="true" className="size-4" />
                  <span className="lc-state-dot" aria-hidden="true" />
                  <strong>{group.label}</strong>
                  <small>{group.note}</small>
                  <b>{group.rows.length}</b>
                </button>
                {isOpen && (
                  <ul className="lc-district-tree">
                    {group.districts.map(([districtName, rows]) => {
                      const districtId = `${group.id}:${districtName}`;
                      const shouldOpen = expandedDistricts.has(districtId);
                      return (
                        <li
                          className="lc-district-group"
                          data-open={shouldOpen}
                          key={districtName}
                        >
                          <button
                            type="button"
                            className="lc-district-toggle"
                            aria-expanded={shouldOpen}
                            onClick={() => toggleDistrict(districtId)}
                          >
                            <ChevronDown
                              aria-hidden="true"
                              className="size-4"
                            />
                            <strong>{districtName}</strong>
                            <small>{rows.length} 个项目</small>
                            <b>{rows.length}</b>
                          </button>
                          {shouldOpen && (
                            <ul className="lc-project-tree-list">
                              {rows.map((model) => {
                                const isSelected =
                                  selected?.project.id === model.project.id;
                                return (
                                  <li key={model.project.id}>
                                    <button
                                      type="button"
                                      className="lc-project-index-row"
                                      data-selected={isSelected}
                                      aria-pressed={isSelected}
                                      onClick={() => {
                                        onSelect(
                                          isSelected ? '' : model.project.id,
                                        );
                                      }}
                                    >
                                      <span
                                        className="lc-project-index-indicator"
                                        aria-hidden="true"
                                      />
                                      <span className="lc-project-index-copy">
                                        <strong>{model.project.name}</strong>
                                        <small>
                                          {model.project.contractCode} ·{' '}
                                          {model.next.label}
                                        </small>
                                        <time
                                          className="lc-project-index-time"
                                          dateTime={projectNodeDate(model)}
                                        >
                                          节点日期 {projectNodeDate(model)}
                                        </time>
                                      </span>
                                      <span className="lc-project-index-amount">
                                        <b>{money(model.remaining)}</b>
                                        <small>待收</small>
                                      </span>
                                      <ChevronRight
                                        aria-hidden="true"
                                        className="size-4"
                                      />
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      {selected && (
        <ProjectPath
          key={selected.project.id}
          model={selected}
          onOpen={onOpen}
          onAction={onAction}
          session={session}
          onDone={onDone}
        />
      )}
    </section>
  );
}
