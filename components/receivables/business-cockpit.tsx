'use client';
import { ArrowRight, Plus, Clock3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from './design-system';
import { type OpenProject } from './project-primitives';
import { buildTaskQueue, money, type ProjectModel } from '@/lib/project-lifecycle';
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
  const queue = buildTaskQueue(models, data.session, today);
  const total = (
    key:
      | 'remaining'
      | 'overdue'
      | 'draft',
  ) => models.reduce((sum, model) => sum + model[key], 0);
  const metrics = [
    ['待回款', money(total('remaining'))],
    ['已逾期', money(total('overdue'))],
    ['待确认', money(total('draft'))],
  ];
  return (
    <div className="lc-cockpit">
      <header className="lc-feed-heading">
        <div>
          <h1>今天要处理什么</h1>
          <p>
            {today} · 优先处理 {queue.length} 个项目
          </p>
        </div>
        <div className="lc-inline-actions">
          <Button variant="outline" onClick={onProjects}>
            进入项目中心
            <ArrowRight aria-hidden="true" />
          </Button>
          {data.session.role === 'CITY_ADMIN' && (
            <Button onClick={onNew}>
              <Plus aria-hidden="true" />
              新建项目
            </Button>
          )}
        </div>
      </header>
      <aside className="lc-cockpit-summary" aria-label="关键数字">
        <h2>先看这三项</h2>
        <dl className="lc-kpis" aria-label="核心经营指标">
          {metrics.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd
                className={
                  label === '已逾期' && total('overdue') > 0
                    ? 'lc-negative'
                    : ''
                }
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </aside>
      <div className="lc-cockpit-flow">
        <section className="lc-cockpit-feed" aria-labelledby="next-work-title">
          <div className="lc-section-heading">
            <h2 id="next-work-title">继续处理</h2>
            <span className="lc-count">{queue.length} 个待办项目</span>
          </div>
          {queue.length ? (
            <ol className="lc-task-list">
              {queue.slice(0, 5).map((task) => (
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
              title={models.length ? '当前没有待办' : '从第一个项目开始'}
              description={
                models.length
                  ? '所有项目目前没有需要立即处理的事项。'
                  : '新建项目、添加付款节点，然后在项目内处理确认、催收和回款。'
              }
            />
          )}
          {queue.length > 5 && (
            <Button
              className="lc-feed-more"
              variant="ghost"
              onClick={onProjects}
            >
              查看其余 {queue.length - 5} 个项目
              <ArrowRight aria-hidden="true" />
            </Button>
          )}
        </section>
      </div>
    </div>
  );
}
