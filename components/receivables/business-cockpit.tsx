'use client';
import { useState } from 'react';
import { ArrowRight, Plus, Clock3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { EmptyState } from './design-system';
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
    ['剩余应收', money(total('remaining')), '已确认应收 − 有效实收'],
    ['逾期金额', money(total('overdue')), '逾期节点的未收余额'],
    ['已回款', money(total('received')), '有效实收，剔除已作废'],
    ['应收总额', money(total('confirmed')), '已确认口径'],
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
    <div className="lc-cockpit">
      <header className="lc-feed-heading">
        <div>
          <h1>工作台</h1>
          <p>
            {today} · {queue.length} 个项目待处理
          </p>
        </div>
        {data.session.role === 'CITY_ADMIN' && (
          <Button onClick={onNew}>
            <Plus aria-hidden="true" />
            新建项目
          </Button>
        )}
      </header>
      <aside className="lc-cockpit-summary" aria-label="经营概况">
        <h2>经营概况</h2>
        <dl className="lc-kpis" aria-label="核心经营指标">
          {metrics.map(([label, value]) => (
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
            </div>
          ))}
        </dl>
        <details className="lc-disclosure">
          <summary>统计口径与待确认金额</summary>
          <p>另有待确认 {money(total('draft'))}，未计入应收总额与风险。</p>
          {metrics.map(([label, , hint]) => (
            <p key={label}>
              {label}：{hint}。
            </p>
          ))}
          <p>
            本月按上海时区统计，包含本月逾期，不含以前月份欠款。回款登记后自动核销。
          </p>
        </details>
      </aside>
      <Tabs defaultValue="tasks" className="lc-cockpit-feed">
        <TabsList
          variant="line"
          className="lc-feed-tabs"
          aria-label="工作台内容"
        >
          <TabsTrigger value="tasks">
            待处理 <span className="lc-count">{queue.length}</span>
          </TabsTrigger>
          <TabsTrigger value="projects">
            项目概览 <span className="lc-count">{models.length}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="tasks">
          <h2 className="sr-only">现在最需要处理</h2>
          <div className="lc-filter-row" aria-label="按待办类型筛选">
            {[
              [-1, '全部'],
              [0, '逾期'],
              [1, '待确认'],
              [2, '今天到期'],
              [3, '7天内'],
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
              </Button>
            ))}
          </div>
          {tasks.length ? (
            <ol className="lc-task-list">
              {tasks.slice(0, limit).map((task) => (
                <li key={task.projectId} data-urgent={task.priority === 0}>
                  <span className="lc-task-marker" aria-hidden="true">
                    <Clock3 className="size-5" />
                  </span>
                  <article className="lc-task-body">
                    <div className="lc-task-project">
                      <button
                        onClick={() =>
                          onOpen(
                            task.projectId,
                            task.next.section,
                            task.node?.id,
                          )
                        }
                      >
                        {task.projectName}
                      </button>
                      <p>
                        {task.districtName} ·{' '}
                        {task.node
                          ? `第 ${task.node.sequenceNo} 节点 · ${task.node.paymentType}`
                          : '付款计划'}
                      </p>
                    </div>
                    <div className="lc-task-reason">
                      <strong>{task.reasons.join(' · ')}</strong>
                      <p>{task.next.reason}</p>
                    </div>
                    <footer className="lc-task-actions">
                      <span>
                        {task.relatedCount > 0
                          ? `另有 ${task.relatedCount} 个待办节点`
                          : `处理权限：${task.next.responsible}`}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          onOpen(
                            task.projectId,
                            task.next.section,
                            task.node?.id,
                          )
                        }
                      >
                        去处理
                        <ArrowRight aria-hidden="true" />
                      </Button>
                    </footer>
                  </article>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState
              title={models.length ? '当前没有此类待办' : '从第一个项目开始'}
              description={
                models.length
                  ? '可切换筛选，或在项目中查看完整付款计划。'
                  : '新建项目、添加付款节点，然后在项目内处理确认、催收和回款。'
              }
            />
          )}
          {tasks.length > limit && (
            <Button
              className="lc-feed-more"
              variant="ghost"
              onClick={() => setLimit((n) => n + 16)}
            >
              显示更多 · 还有 {tasks.length - limit} 个
            </Button>
          )}
        </TabsContent>
        <TabsContent value="projects">
          <div className="lc-section-heading">
            <h2 className="sr-only">项目状态总览</h2>
            <NativeSelect
              aria-label="按项目状态筛选"
              value={stage}
              onChange={(e) => setStage(e.target.value as ProjectStage | 'ALL')}
            >
              <NativeSelectOption value="ALL">
                全部状态 · {models.length}
              </NativeSelectOption>
              {Object.entries(STAGES).map(([key, label]) => (
                <NativeSelectOption key={key} value={key}>
                  {label} ·{' '}
                  {
                    models.filter((m) =>
                      projectMatchesStage(m, key as ProjectStage),
                    ).length
                  }
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button variant="ghost" size="sm" onClick={onProjects}>
              全部项目
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
          {shown.length ? (
            <ProjectRows models={shown.slice(0, 8)} onOpen={onOpen} />
          ) : (
            <p className="lc-empty">暂无符合此状态的项目。</p>
          )}
          <p className="lc-table-note p-4">
            展示 {Math.min(shown.length, 8)} / {shown.length}{' '}
            项。待确认、催收与部分回款可并存，筛选数量不相加。
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
