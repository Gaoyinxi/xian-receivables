'use client';
import { useState } from 'react';
import { ArrowRight, CheckCheck, Plus, Clock3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, PageHeading } from './design-system';
import { ProjectRows, type OpenProject } from './project-primitives';
import {
  buildTaskQueue,
  money,
  projectMatchesStage,
  STAGES,
  type ProjectModel,
  type ProjectStage,
} from '@/lib/project-lifecycle';
import type { BootstrapData } from '@/lib/types';

export function BusinessCockpit({
  data,
  models,
  today,
  onOpen,
  onNew,
  onProjects,
}: {
  data: BootstrapData;
  models: ProjectModel[];
  today: string;
  onOpen: OpenProject;
  onNew: () => void;
  onProjects: () => void;
}) {
  const [priority, setPriority] = useState(-1);
  const [stage, setStage] = useState<ProjectStage | 'ALL'>('ALL');
  const [limit, setLimit] = useState(8);
  const queue = buildTaskQueue(models, data.session, today);
  const tasks = queue.filter(
    (task) => priority < 0 || task.priority === priority,
  );
  const total = (
    key:
      | 'confirmed'
      | 'received'
      | 'remaining'
      | 'overdue'
      | 'monthly'
      | 'draft',
  ) => models.reduce((sum, model) => sum + model[key], 0);
  const metrics = [
    ['应收总额', money(total('confirmed')), '已确认口径'],
    ['已回款', money(total('received')), '有效实收，剔除已作废'],
    ['剩余应收', money(total('remaining')), '已确认应收 − 有效实收'],
    ['逾期金额', money(total('overdue')), '已逾期节点的未收余额'],
    [
      '高风险项目',
      `${models.filter((m) => m.risk === 'RED').length} 个`,
      '含红色风险应收的项目',
    ],
    ['本月预计回款', money(total('monthly')), '本月到期未回款，非到账承诺'],
  ];
  const shown = models.filter(
    (m) => stage === 'ALL' || projectMatchesStage(m, stage),
  );
  return (
    <>
      <PageHeading
        eyebrow="工作台"
        title="业务驾驶舱"
        description={`${today} · 先看未收回的金额，再处理优先事项。`}
        actions={
          data.session.role === 'CITY_ADMIN' ? (
            <Button onClick={onNew}>
              <Plus />
              新建项目
            </Button>
          ) : undefined
        }
      />
      <dl className="lc-kpis" aria-label="核心经营指标">
        {metrics.map(([label, value, hint]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd
              className={
                label === '逾期金额' && total('overdue') > 0
                  ? 'lc-negative'
                  : ''
              }
            >
              {value}
            </dd>
            <p>{hint}</p>
          </div>
        ))}
      </dl>
      <div className="lc-metric-footnote">
        <span>
          另有待确认金额 {money(total('draft'))}，未计入应收总额与风险指标。
        </span>
        <details>
          <summary>查看指标口径</summary>
          <p>
            本月预计回款按上海时区本月付款日统计当前未收余额，包含本月已经逾期的款项，不包含以前月份欠款；不是客户付款承诺。高风险项目按现行规则的红色应收去重。业务记录刷新后同步更新。
          </p>
        </details>
      </div>
      <section className="lc-section" aria-labelledby="task-queue-title">
        <div className="lc-section-heading">
          <div>
            <h2 id="task-queue-title">现在最需要处理</h2>
            <p>
              {queue.length} 个项目有待办 ·
              每个项目优先展示最紧急节点，原因合并显示
            </p>
          </div>
          <span className="lc-auto-note">
            <CheckCheck aria-hidden="true" className="size-4" />
            回款登记后自动核销
          </span>
        </div>
        <div className="lc-filter-row" aria-label="按待办类型筛选">
          {[
            [-1, '全部'],
            [0, '逾期跟进'],
            [1, '待确认'],
            [2, '今天到期'],
            [3, '7天内到期'],
            [4, '待建节点'],
          ].map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={priority === value ? 'secondary' : 'ghost'}
              aria-pressed={priority === value}
              onClick={() => {
                setPriority(Number(value));
                setLimit(8);
              }}
            >
              {label}
              <span className="lc-count">
                {
                  queue.filter((t) => value === -1 || t.priority === value)
                    .length
                }
              </span>
            </Button>
          ))}
        </div>
        {tasks.length ? (
          <ol className="lc-task-list">
            {tasks.slice(0, limit).map((task) => (
              <li key={task.projectId} data-urgent={task.priority === 0}>
                <span className="lc-task-marker" aria-hidden="true">
                  <Clock3 className="size-4" />
                </span>
                <div className="lc-task-project">
                  <button
                    onClick={() =>
                      onOpen(task.projectId, task.next.section, task.node?.id)
                    }
                  >
                    {task.projectName}
                  </button>
                  <p>
                    {task.districtName} ·{' '}
                    {task.node
                      ? `第 ${task.node.sequenceNo} 节点 · ${task.node.paymentType}`
                      : '付款计划'}
                    {task.relatedCount > 0 &&
                      ` · 另有 ${task.relatedCount} 个待办节点`}
                  </p>
                </div>
                <div className="lc-task-reason">
                  <strong>{task.reasons.join(' · ')}</strong>
                  <p>{task.next.reason}</p>
                  <span>处理权限：{task.next.responsible}</span>
                </div>
                <Button
                  variant={task.priority === 0 ? 'default' : 'outline'}
                  onClick={() =>
                    onOpen(task.projectId, task.next.section, task.node?.id)
                  }
                >
                  {task.next.label}
                  <ArrowRight aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState
            title={models.length ? '当前筛选下没有待办' : '从第一个项目开始'}
            description={
              models.length
                ? '调整待办类型，或在项目中查看完整付款计划。'
                : '建立项目与合同后，继续添加付款节点；后续确认、催收和回款都在同一个项目中完成。'
            }
          />
        )}
        {tasks.length > limit && (
          <Button
            className="m-4"
            variant="outline"
            onClick={() => setLimit((n) => n + 16)}
          >
            加载更多待办（剩余 {tasks.length - limit}）
          </Button>
        )}
      </section>
      <section className="lc-section" aria-labelledby="portfolio-title">
        <div className="lc-section-heading">
          <div>
            <h2 id="portfolio-title">项目状态总览</h2>
            <p>
              逾期优先显示；待确认、催收中和部分回款可同时存在，筛选数量不相加。
            </p>
          </div>
          <Button variant="ghost" onClick={onProjects}>
            查看全部项目
            <ArrowRight />
          </Button>
        </div>
        <div className="lc-stage-filters">
          <Button
            variant={stage === 'ALL' ? 'secondary' : 'ghost'}
            size="sm"
            aria-pressed={stage === 'ALL'}
            onClick={() => setStage('ALL')}
          >
            全部 {models.length}
          </Button>
          {Object.entries(STAGES)
            .filter(([key]) => key !== 'REVIEW')
            .map(([key, label]) => (
              <Button
                key={key}
                variant={stage === key ? 'secondary' : 'ghost'}
                size="sm"
                aria-pressed={stage === key}
                onClick={() => setStage(key as ProjectStage)}
              >
                {label}
                <span className="lc-count">
                  {
                    models.filter((m) =>
                      projectMatchesStage(m, key as ProjectStage),
                    ).length
                  }
                </span>
              </Button>
            ))}
        </div>
        {shown.length ? (
          <ProjectRows models={shown.slice(0, 8)} onOpen={onOpen} />
        ) : (
          <p className="lc-empty">暂无符合此状态的项目。</p>
        )}
        {shown.length > 8 && (
          <p className="lc-table-note p-4">
            展示前 8 项；全部 {shown.length} 项可在项目列表中筛选查看。
          </p>
        )}
      </section>
    </>
  );
}
