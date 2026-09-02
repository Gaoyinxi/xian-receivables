'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, ChevronRight, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { money, type ProjectModel } from '@/lib/project-lifecycle';
import { type OpenProject } from './project-primitives';
import type { ProjectSection } from '@/lib/project-navigation';

type TaskState = 'done' | 'current' | 'future';
type TaskEvent = {
  id: string;
  label: string;
  state: TaskState;
  date: string;
  description: string;
  section: ProjectSection;
};
type ProjectAction = (model: ProjectModel) => void;

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
  expandedTaskId,
  onExpand,
  onOpen,
  onAction,
}: {
  model: ProjectModel;
  node: ProjectModel['nodes'][number];
  expandedTaskId: string | null;
  onExpand: (taskId: string) => void;
  onOpen: OpenProject;
  onAction?: ProjectAction;
}) {
  return (
    <ol className="lc-task-tree" aria-label={`${node.paymentType}业务事件`}>
      {eventsForNode(model, node).map((event) => {
        const taskId = `${node.id}:${event.id}`;
        const expanded = expandedTaskId === taskId;
        return (
          <li key={taskId} data-state={event.state} data-expanded={expanded}>
            <button
              type="button"
              className="lc-task-tree-row"
              onClick={() => onExpand(taskId)}
              aria-expanded={expanded}
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
              <section
                className="lc-task-detail"
                aria-label={`${event.label}详情`}
              >
                <p>{event.description}</p>
                <dl>
                  <div>
                    <dt>应收编号</dt>
                    <dd>{node.receivableCode}</dd>
                  </div>
                  <div>
                    <dt>待收金额</dt>
                    <dd>{money(node.remainingAmountCents)}</dd>
                  </div>
                </dl>
                <div className="lc-task-detail-actions">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      onOpen(model.project.id, event.section, node.id)
                    }
                  >
                    完整详情
                  </Button>
                  {event.state === 'current' && (
                    <Button
                      size="sm"
                      onClick={() =>
                        onAction
                          ? onAction(model)
                          : onOpen(
                              model.project.id,
                              model.next.section,
                              model.next.receivableId,
                            )
                      }
                    >
                      {model.next.label}
                      <ArrowRight aria-hidden="true" />
                    </Button>
                  )}
                </div>
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
  onOpen,
}: {
  model: ProjectModel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpen: OpenProject;
}) {
  const [tab, setTab] = useState<'risk' | 'attachments' | 'audit' | 'settings'>(
    'risk',
  );
  const riskReason =
    model.overdue > 0
      ? `当前有 ${money(model.overdue)} 已逾期，系统按服务端风险规则计算为 ${model.risk} 级。`
      : '当前无逾期未收金额。';
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="lc-project-resources-drawer">
        <SheetHeader>
          <SheetTitle>项目资料</SheetTitle>
          <SheetDescription>
            {model.project.name} · {model.project.projectCode}
          </SheetDescription>
        </SheetHeader>
        <div
          className="lc-resource-tabs"
          role="tablist"
          aria-label="项目资料分类"
        >
          {(
            [
              ['risk', '风险'],
              ['attachments', '附件'],
              ['audit', '审计'],
              ['settings', '设置'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              data-active={tab === value}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="lc-resource-body">
          {tab === 'risk' && (
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
              <Button
                variant="outline"
                onClick={() => onOpen(model.project.id, 'risk')}
              >
                完整风险解释
              </Button>
            </section>
          )}
          {tab === 'attachments' && (
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
              <Button
                variant="outline"
                onClick={() => onOpen(model.project.id, 'contract')}
              >
                管理合同与附件
              </Button>
            </section>
          )}
          {tab === 'audit' && (
            <section>
              <span className="lc-resource-kicker">最近审计</span>
              <h3>{model.audits.length} 条记录</h3>
              {model.audits.slice(0, 8).map((item) => (
                <article key={item.id}>
                  <strong>{item.action}</strong>
                  <p>
                    {item.actorName} ·{' '}
                    {item.createdAt.slice(0, 16).replace('T', ' ')}
                  </p>
                </article>
              ))}
              <Button
                variant="outline"
                onClick={() => onOpen(model.project.id, 'audit')}
              >
                查看全部审计
              </Button>
            </section>
          )}
          {tab === 'settings' && (
            <section>
              <span className="lc-resource-kicker">项目设置</span>
              <h3>{model.project.status}</h3>
              <p>项目编码、合同编码与区县数据范围由现有业务规则维护。</p>
              <Button
                variant="outline"
                onClick={() => onOpen(model.project.id, 'contract')}
              >
                查看项目信息
              </Button>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ProjectPath({
  model,
  onOpen,
  onClose,
  onAction,
}: {
  model: ProjectModel;
  onOpen: OpenProject;
  onClose: () => void;
  onAction?: ProjectAction;
}) {
  const [showAll, setShowAll] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const currentNode =
    model.nodes.find((node) => node.id === model.next.receivableId) ??
    model.nodes.find((node) => node.remainingAmountCents > 0) ??
    model.nodes.at(-1);
  const visibleNodes = showAll ? model.nodes : currentNode ? [currentNode] : [];
  const progress = model.confirmed
    ? Math.round((model.received / model.confirmed) * 100)
    : 0;

  return (
    <aside
      className="lc-project-preview lc-project-path"
      aria-label={`${model.project.name}当前业务路径`}
    >
      <section className="lc-path-project-summary">
        <button type="button" className="lc-path-back" onClick={onClose}>
          所有项目 / {model.project.districtName}
        </button>
        <div>
          <span>{model.project.projectCode}</span>
          <h3>{model.project.name}</h3>
          <p>
            {model.project.districtName} · {model.project.customerName}
          </p>
        </div>
        <dl>
          <div>
            <dt>合同</dt>
            <dd>{money(model.project.contractAmountCents)}</dd>
          </div>
          <div>
            <dt>已收</dt>
            <dd>{money(model.received)}</dd>
          </div>
          <div data-emphasis="true">
            <dt>待收</dt>
            <dd>{money(model.remaining)}</dd>
          </div>
        </dl>
        <progress
          aria-label="已确认应收回款进度"
          max={Math.max(model.confirmed, 1)}
          value={model.received}
          title={`已确认应收回款 ${progress}%`}
        />
      </section>
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
          onClick={() =>
            onAction
              ? onAction(model)
              : onOpen(
                  model.project.id,
                  model.next.section,
                  model.next.receivableId,
                )
          }
        >
          {model.next.label}
          <ArrowRight aria-hidden="true" />
        </Button>
      </section>
      <header className="lc-current-path-head">
        <div>
          <span>CURRENT PATH</span>
          <h2>当前业务路径</h2>
        </div>
        {model.nodes.length > 1 && (
          <button
            type="button"
            className="lc-focus-toggle"
            onClick={() => {
              setShowAll(!showAll);
              setExpandedTaskId(null);
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
              <button
                type="button"
                className="lc-payment-node"
                onClick={() =>
                  setExpandedTaskId(
                    expandedTaskId === `${node.id}:receipt`
                      ? null
                      : `${node.id}:receipt`,
                  )
                }
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
              {(node.id === currentNode?.id || showAll) && (
                <TaskTree
                  model={model}
                  node={node}
                  expandedTaskId={expandedTaskId}
                  onExpand={(id) =>
                    setExpandedTaskId(expandedTaskId === id ? null : id)
                  }
                  onOpen={onOpen}
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
            setExpandedTaskId(null);
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => onOpen(model.project.id)}
        >
          完整页面
        </Button>
      </footer>
      <ProjectResources
        model={model}
        open={resourcesOpen}
        onOpenChange={setResourcesOpen}
        onOpen={onOpen}
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
}: {
  models: ProjectModel[];
  selectedId: string | null;
  onSelect: (projectId: string) => void;
  onOpen: OpenProject;
  onAction?: ProjectAction;
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
  const [expandedGroup, setExpandedGroup] = useState<StateGroupId>('attention');
  const [expandedDistrict, setExpandedDistrict] = useState<string | null>(null);
  const hasAttention = groups.some((group) => group.id === 'attention');

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
            const selectedInGroup =
              selected && stateGroup(selected) === group.id;
            const isOpen =
              selectedInGroup ||
              expandedGroup === group.id ||
              (!hasAttention &&
                expandedGroup === 'attention' &&
                group.id === groups[0]?.id);
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
                  onClick={() => setExpandedGroup(group.id)}
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
                      const shouldOpen =
                        selected?.project.districtName === districtName ||
                        expandedDistrict === `${group.id}:${districtName}` ||
                        rows.length === 1;
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
                            onClick={() =>
                              setExpandedDistrict(
                                shouldOpen
                                  ? null
                                  : `${group.id}:${districtName}`,
                              )
                            }
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
                                        setExpandedGroup(group.id);
                                        setExpandedDistrict(
                                          `${group.id}:${districtName}`,
                                        );
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
          onClose={() => onSelect('')}
          onAction={onAction}
        />
      )}
    </section>
  );
}
