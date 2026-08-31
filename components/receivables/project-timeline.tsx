'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, Circle, Paperclip } from 'lucide-react';
import { lifecycleSteps, projectEvents } from '@/lib/project-activity';
import { money, dateTime, type ProjectModel } from '@/lib/project-lifecycle';
import type { ProjectSection } from '@/lib/project-navigation';

export function LifecycleTrack({
  model,
  section,
  onSection,
}: {
  model: ProjectModel;
  section: ProjectSection;
  onSection: (section: ProjectSection) => void;
}) {
  return (
    <nav className="lc-lifecycle" aria-label="项目应收生命周期">
      <ol>
        {lifecycleSteps(model).map((step) => (
          <li key={step.id} data-status={step.status}>
            <button
              onClick={() => onSection(step.section)}
              aria-current={section === step.section ? 'step' : undefined}
            >
              <span className="lc-step-icon" aria-hidden="true">
                {step.status === 'done' ? (
                  <Check className="size-4" />
                ) : (
                  <Circle className="size-4" />
                )}
              </span>
              <strong>{step.label}</strong>
              <span>
                {step.status === 'done'
                  ? '已完成'
                  : step.status === 'partial'
                    ? '部分完成'
                    : step.status === 'optional'
                      ? '按需处理'
                      : '未完成'}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
export function LifecycleEvidence({
  model,
  onSection,
}: {
  model: ProjectModel;
  onSection: (section: ProjectSection) => void;
}) {
  return (
    <section className="lc-section">
      <div className="lc-section-heading">
        <div>
          <h2>生命周期进度与依据</h2>
          <p>
            各节点可并行推进；已完成表示已有对应记录，不表示后续不能新增或更正。
          </p>
        </div>
      </div>
      <div className="lc-step-evidence">
        {lifecycleSteps(model).map((step) => (
          <article key={step.id}>
            <div>
              <button onClick={() => onSection(step.section)}>
                {step.label}
                <span>{step.detail}</span>
              </button>
              <p>处理权限：{step.owner}</p>
            </div>
            <div>
              <strong>{money(step.amount)}</strong>
              <p>
                {step.timeLabel}：
                {step.time ? dateTime(step.time) : '尚无可用时间'}
              </p>
            </div>
            <button
              className="app-inline-link"
              onClick={() => onSection(step.section)}
            >
              {step.files ? `${step.files} 份附件` : '查看记录'} →
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
export function ProjectTimeline({
  model,
  today,
  onNode,
}: {
  model: ProjectModel;
  today: string;
  onNode: (id: string) => void;
}) {
  const [limit, setLimit] = useState(12);
  const events = projectEvents(model);
  const past = events.filter((e) => e.date.slice(0, 10) <= today).toReversed();
  const future = events.filter((e) => e.date.slice(0, 10) > today);
  const renderEvents = (rows: typeof events) =>
    rows.map((event) => (
      <li
        key={event.id}
        className={event.voided ? 'is-voided' : ''}
        data-planned={event.planned}
      >
        <time dateTime={event.date}>{dateTime(event.date)}</time>
        <div>
          <h3>
            {event.title}
            {event.voided && <span className="lc-table-note"> · 已作废</span>}
            {event.planned && <span className="lc-table-note"> · 计划</span>}
          </h3>
          <p>
            {event.actor}
            {event.amount !== undefined && ` · ${money(event.amount)}`}
          </p>
          {event.recordedAt && <p>登记时间：{dateTime(event.recordedAt)}</p>}
          {event.note && <p className="lc-event-note">{event.note}</p>}
          <div className="lc-inline-actions">
            {event.nodeId && (
              <button
                className="app-inline-link"
                onClick={() => onNode(event.nodeId!)}
              >
                查看对应节点
              </button>
            )}
            {event.attachmentId && (
              <a
                className="app-inline-link"
                href={`/api/attachments/${event.attachmentId}`}
                download
              >
                <Paperclip aria-hidden="true" className="size-3" />
                查看附件
              </a>
            )}
          </div>
        </div>
      </li>
    ));
  return (
    <section className="lc-section">
      <div className="lc-section-heading">
        <div>
          <h2>最近动态</h2>
          <p>按业务日期倒序 · 作废记录仍保留</p>
        </div>
      </div>
      <ol className="lc-project-timeline">
        {renderEvents(past.slice(0, limit))}
      </ol>
      {!past.length && <p className="lc-empty">还没有已发生的业务记录。</p>}
      {past.length > limit && (
        <Button
          variant="ghost"
          className="lc-feed-more"
          onClick={() => setLimit((n) => n + 12)}
        >
          更早动态 · 还有 {past.length - limit} 条
        </Button>
      )}
      {future.length > 0 && (
        <details className="lc-disclosure">
          <summary>后续日程 · {future.length} 条</summary>
          <p>按业务日期排列；付款计划不代表已经到账。</p>
          <ol className="lc-project-timeline">{renderEvents(future)}</ol>
        </details>
      )}
    </section>
  );
}
