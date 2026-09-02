'use client';
import { Paperclip, PencilLine, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RiskBadge, WriteoffBadge } from './design-system';
import {
  canConfirmReceivable,
  canCorrectOperationalRecord,
  canCreateOperationalRecord,
  canManageReceivable,
} from '@/lib/domain';
import { COLLECTION_LABELS } from '@/lib/project-activity';
import { dateTime, money, type ProjectModel } from '@/lib/project-lifecycle';
import type {
  CollectionAction,
  CollectionRecord,
  DemoSession,
} from '@/lib/types';

export function ProjectNodes({
  model,
  session,
  focusedNodeId,
  nodeId,
  confirmingId,
  onNode,
  onConfirm,
  onReceipt,
  onCollection,
}: {
  model: ProjectModel;
  session: DemoSession;
  focusedNodeId?: string;
  nodeId?: string;
  confirmingId: string | null;
  onNode: () => void;
  onConfirm: (id: string) => void;
  onReceipt: (id: string) => void;
  onCollection: (id: string) => void;
}) {
  const nodes = nodeId
    ? model.nodes.filter((node) => node.id === nodeId)
    : model.nodes;
  return (
    <section className="lc-section">
      <div className="lc-section-heading">
        <div>
          <h2>{nodeId ? '节点处理' : '项目处理链'}</h2>
          <p>
            {nodeId
              ? '确认应收后，可登记催收或实际回款；每次操作都会写入此节点动态。'
              : '按付款节点依次处理：确认应收，然后登记催收或实际回款。每次操作都会更新下方动态。'}
          </p>
        </div>
        {canManageReceivable(
          session.role,
          session.districtId,
          model.project.districtId,
        ) && (
          <Button variant="outline" onClick={onNode}>
            <Plus />
            新增付款节点
          </Button>
        )}
      </div>
      {!nodes.length && (
        <p className="lc-empty">
          尚无付款节点。根据合同建立第一笔应收，系统会计算约定付款日。
        </p>
      )}
      {nodes.map((node) => (
        <article
          key={node.id}
          id={`project-node-${node.id}`}
          className="lc-node-row"
          data-focused={node.id === focusedNodeId}
        >
          <div className="lc-node-main">
            <div>
              <h3>
                第 {node.sequenceNo} 节点 · {node.paymentType}
              </h3>
              <p>
                {node.receivableCode} · {node.dueDate} 到期
              </p>
            </div>
            <div>
              <strong>{money(node.amountCents)}</strong>
              <p>
                已收 {money(node.receivedAmountCents)} · 剩余{' '}
                {money(node.remainingAmountCents)}
              </p>
            </div>
            <div className="lc-inline-actions">
              <RiskBadge item={node} />
              {node.confirmationStatus === 'CONFIRMED' && (
                <WriteoffBadge status={node.writeoffStatus} />
              )}
            </div>
          </div>
          <details open={node.id === focusedNodeId || undefined}>
            <summary>付款条件、基准日期与确认依据</summary>
            <dl className="lc-node-facts">
              <div>
                <dt>付款条件</dt>
                <dd>{node.paymentCondition}</dd>
              </div>
              <div>
                <dt>约定付款日</dt>
                <dd>
                  {node.baselineDate} + {node.termDays} 天 = {node.dueDate}
                </dd>
              </div>
              <div>
                <dt>确认状态 / 时间</dt>
                <dd>
                  {node.confirmationStatus === 'DRAFT'
                    ? '待市级管理员确认'
                    : `已确认 · ${dateTime(node.confirmedAt ?? model.audits.find((a) => a.entityType === 'RECEIVABLE' && a.entityId === node.id && a.action === 'CONFIRM')?.createdAt)}`}
                </dd>
              </div>
              <div>
                <dt>验收 / 发票</dt>
                <dd>
                  {node.acceptanceType ?? '未登记验收'} {node.acceptanceDate} ·{' '}
                  {node.invoiceStatus ?? '未登记发票'}{' '}
                  {node.invoiceDeliveredDate}
                </dd>
              </div>
            </dl>
          </details>
          <div className="lc-node-actions">
            {node.confirmationStatus === 'DRAFT' ? (
              canConfirmReceivable(session.role) ? (
                <Button
                  disabled={Boolean(confirmingId)}
                  aria-busy={confirmingId === node.id}
                  onClick={() => onConfirm(node.id)}
                >
                  {confirmingId === node.id ? '正在确认…' : '确认应收'}
                </Button>
              ) : (
                <span className="lc-table-note">
                  处理权限：市级管理员；本区人员可先核对付款条件。
                </span>
              )
            ) : node.remainingAmountCents > 0 &&
              canCreateOperationalRecord(
                session.role,
                session.districtId,
                node.districtId,
              ) ? (
              <>
                <Button
                  onClick={() =>
                    node.overdueDays > 0
                      ? onCollection(node.id)
                      : onReceipt(node.id)
                  }
                >
                  {node.overdueDays > 0
                    ? '登记催收'
                    : node.receivedAmountCents > 0
                      ? '登记下一笔回款'
                      : '登记回款'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    node.overdueDays > 0
                      ? onReceipt(node.id)
                      : onCollection(node.id)
                  }
                >
                  {node.overdueDays > 0 ? '登记实际回款' : '记录跟进'}
                </Button>
              </>
            ) : (
              <span className="lc-table-note">本节点已自动核销结清。</span>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}

export function ProjectCollections({
  model,
  session,
  focusedNodeId,
  nodeId,
  onNew,
  onCorrect,
}: {
  model: ProjectModel;
  session: DemoSession;
  focusedNodeId?: string;
  nodeId?: string;
  onNew: (id: string, action?: CollectionAction) => void;
  onCorrect: (row: CollectionRecord) => void;
}) {
  const target = nodeId
    ? model.open.find((r) => r.id === nodeId)
    : focusedNodeId
      ? model.open.find((r) => r.id === focusedNodeId)
    : (model.overdueNodes[0] ?? model.open[0]);
  const collections = nodeId
    ? model.collections.filter((row) => row.receivableId === nodeId)
    : model.collections;
  const canOperate = canCreateOperationalRecord(
    session.role,
    session.districtId,
    model.project.districtId,
  );
  const canCorrect = canCorrectOperationalRecord(
    session.role,
    session.districtId,
    model.project.districtId,
  );
  return (
    <section className="lc-section">
      <div className="lc-section-heading">
        <div>
          <h2>催收跟进</h2>
          <p>只追加、不覆盖。正式函件必须附带文件，作废记录仍可追溯。</p>
        </div>
        {target && canOperate && (
          <Button onClick={() => onNew(target.id)}>登记催收</Button>
        )}
      </div>
      <ol className="lc-collection-list">
        {collections.map((row) => (
          <li
            key={row.id}
            className={row.status === 'VOIDED' ? 'is-voided' : ''}
          >
            <time dateTime={row.actionDate}>{row.actionDate}</time>
            <div>
              <h3>
                {COLLECTION_LABELS[row.actionType]}
                <span className="lc-table-note">
                  {' '}
                  · {row.status === 'VOIDED' ? '已作废' : '有效记录'}
                  {row.correctionOfId && ' · 更正记录'}
                </span>
              </h3>
              <p>
                {row.receivableCode} · {row.createdByName}
              </p>
              <p className="lc-event-note">{row.note || '无补充纪要'}</p>
              {row.voidReason && (
                <p>
                  作废原因：{row.voidReason} · {dateTime(row.voidedAt)}
                </p>
              )}
              {row.attachmentId && (
                <a
                  href={`/api/attachments/${row.attachmentId}`}
                  className="app-inline-link"
                  download
                >
                  <Paperclip className="size-3" />
                  {row.attachmentName || '催缴附件'}
                </a>
              )}
              <p>登记时间：{dateTime(row.createdAt)}</p>
            </div>
            {canCorrect && row.status === 'VALID' && (
              <Button variant="ghost" size="sm" onClick={() => onCorrect(row)}>
                <PencilLine />
                作废并更正
              </Button>
            )}
          </li>
        ))}
      </ol>
      {!collections.length && (
        <p className="lc-empty">
          尚未记录催收。跟进不是回款前置条件，实际到账后可直接登记回款。
        </p>
      )}
    </section>
  );
}

export function ProjectAudit({ model }: { model: ProjectModel }) {
  return (
    <section className="lc-section">
      <div className="lc-section-heading">
        <div>
          <h2>项目相关审计</h2>
          <p>
            从最近 300 条可见审计中关联到本项目的 {model.audits.length}{' '}
            条；不是完整项目历史，原始日志继续保存在数据库。
          </p>
        </div>
      </div>
      <div className="lc-audit-list">
        {model.audits.map((row) => (
          <details key={row.id}>
            <summary>
              <time>{dateTime(row.createdAt)}</time>
              <span>{row.actorName}</span>
              <span>
                {row.action === 'VOID_AND_CORRECT'
                  ? '作废并更正'
                  : row.action === 'CONFIRM'
                    ? '确认应收'
                    : row.action === 'UPLOAD'
                      ? '上传附件'
                      : row.action === 'CREATE'
                        ? '新增记录'
                        : row.action}
              </span>
              <span className="lc-table-note">{row.entityType}</span>
            </summary>
            <dl>
              <dt>记录 / 字段</dt>
              <dd>
                {row.entityId} · {row.fieldName || '整条记录'}
              </dd>
              <dt>原值</dt>
              <dd>{row.oldValue ?? '无'}</dd>
              <dt>新值</dt>
              <dd>{row.newValue ?? '无'}</dd>
              <dt>原因 / 来源</dt>
              <dd>
                {row.reason || '无'} · {row.source}
              </dd>
            </dl>
          </details>
        ))}
      </div>
      {!model.audits.length && (
        <p className="lc-empty">
          最近返回的审计中没有本项目记录；这不表示历史操作不存在。
        </p>
      )}
    </section>
  );
}
