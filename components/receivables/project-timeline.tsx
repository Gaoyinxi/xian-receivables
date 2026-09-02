'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Paperclip } from 'lucide-react';
import { projectEvents } from '@/lib/project-activity';
import { money, dateTime, type ProjectModel } from '@/lib/project-lifecycle';
export function ProjectTimeline({
  model,
  today,
  nodeId,
  onNode,
}: {
  model: ProjectModel;
  today: string;
  nodeId?: string;
  onNode: (id: string) => void;
}) {
  const [limit, setLimit] = useState(12);
  const events = projectEvents(model).filter(
    (event) => !nodeId || event.nodeId === nodeId,
  );
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
          <h2>{nodeId ? '此节点动态' : '全部动态'}</h2>
          <p>
            {nodeId
              ? '仅显示此节点的确认、催收、回款与作废记录。'
              : '按业务日期倒序 · 确认、催收、回款、附件与作废记录均保留'}
          </p>
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
