'use client';
import { ArrowDown, Paperclip, PencilLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { money, dateTime, type ProjectModel } from '@/lib/project-lifecycle';
import {
  canCorrectOperationalRecord,
  canCreateOperationalRecord,
} from '@/lib/domain';
import type { DemoSession, ReceiptRecord } from '@/lib/types';

export function ProjectMoney({ model }: { model: ProjectModel }) {
  const contract = model.project.contractAmountCents;
  return (
    <section
      className="lc-money-relation"
      aria-labelledby="money-relation-title"
    >
      <h2 id="money-relation-title">金额关系</h2>
      <div className="lc-money-rows">
        {[
          ['合同金额', contract, contract, '合同登记总额'],
          [
            '已形成应收',
            model.formed,
            contract,
            `已确认 ${money(model.confirmed)} · 待确认 ${money(model.draft)}`,
          ],
          ['已回款', model.received, model.confirmed, '有效回款 / 已确认应收'],
          [
            '剩余应收',
            model.remaining,
            model.confirmed,
            '已确认应收余额，不含待确认',
          ],
        ].map(([label, value, max, hint]) => (
          <div key={String(label)} className="lc-money-row">
            <div>
              <span>{label}</span>
              <strong>{money(Number(value))}</strong>
            </div>
            <progress
              aria-label={`${label}，${hint}`}
              max={Math.max(Number(max), Number(value), 1)}
              value={Number(value)}
            />
            <p>
              {hint}
              {Number(max) > 0 &&
                ` · ${((Number(value) / Number(max)) * 100).toFixed(1)}%`}
            </p>
          </div>
        ))}
      </div>
      <p className={model.formed > contract ? 'lc-negative' : 'lc-table-note'}>
        {model.formed > contract
          ? `已形成应收超出合同金额 ${money(model.formed - contract)}，请核对合同与付款计划；原始金额未被截断。`
          : `合同中尚未形成节点的金额：${money(contract - model.formed)}。`}
      </p>
    </section>
  );
}

export function ProjectReceipts({
  model,
  session,
  focusedNodeId,
  onReceipt,
  onCorrect,
}: {
  model: ProjectModel;
  session: DemoSession;
  focusedNodeId?: string;
  onReceipt: (id: string) => void;
  onCorrect: (row: ReceiptRecord) => void;
}) {
  const nodes = model.nodes.toSorted(
    (a, b) =>
      Number(b.id === focusedNodeId) - Number(a.id === focusedNodeId) ||
      a.sequenceNo - b.sequenceNo,
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
          <h2>每笔回款去向</h2>
          <p>
            按付款节点归集。有效回款自动核销；作废流水保留但不参与金额汇总。
          </p>
        </div>
      </div>
      {!nodes.length && (
        <p className="lc-empty">尚未建立付款节点，请先在付款节点页建立应收。</p>
      )}
      {nodes.map((node) => {
        const receipts = model.receipts
          .filter((r) => r.receivableId === node.id)
          .toSorted(
            (a, b) =>
              a.receivedDate.localeCompare(b.receivedDate) ||
              a.createdAt.localeCompare(b.createdAt),
          );
        const actionable =
          node.confirmationStatus === 'CONFIRMED' &&
          node.remainingAmountCents > 0 &&
          canCreateOperationalRecord(
            session.role,
            session.districtId,
            node.districtId,
          );
        return (
          <details
            key={node.id}
            className="lc-node-ledger"
            open={
              focusedNodeId ? node.id === focusedNodeId || undefined : undefined
            }
          >
            <summary>
              <span>
                第 {node.sequenceNo} 节点 · {node.paymentType}
              </span>
              <span>
                应收 {money(node.amountCents)} → 剩余{' '}
                {money(node.remainingAmountCents)}
              </span>
            </summary>
            <div className="lc-receipt-flow">
              <div className="lc-flow-start">
                <strong>节点应收 {money(node.amountCents)}</strong>
                <span>
                  {node.receivableCode} ·{' '}
                  {node.confirmationStatus === 'DRAFT' ? '尚未确认' : '已确认'}
                </span>
              </div>
              <ArrowDown aria-hidden="true" className="lc-flow-arrow" />
              <ol>
                {receipts.map((row) => (
                  <li
                    key={row.id}
                    className={row.status === 'VOIDED' ? 'is-voided' : ''}
                  >
                    <div>
                      <strong>{money(row.amountCents)}</strong>
                      <span>
                        {row.receivedDate} · {row.createdByName} ·{' '}
                        {row.status === 'VOIDED'
                          ? '已作废，不抵扣'
                          : '有效回款，已自动核销'}
                        {row.correctionOfId ? ' · 更正记录' : ''}
                      </span>
                      <p>{row.note}</p>
                      {row.voidReason && (
                        <p>
                          作废原因：{row.voidReason} · {dateTime(row.voidedAt)}
                        </p>
                      )}
                      {row.attachmentId && (
                        <a
                          className="app-inline-link"
                          href={`/api/attachments/${row.attachmentId}`}
                          download
                        >
                          <Paperclip aria-hidden="true" className="size-3" />
                          {row.attachmentName ?? '回款凭证'}
                        </a>
                      )}
                    </div>
                    {canCorrect && row.status === 'VALID' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onCorrect(row)}
                      >
                        <PencilLine />
                        作废并更正
                      </Button>
                    )}
                  </li>
                ))}
              </ol>
              {!receipts.length && <p className="lc-empty">尚无回款流水。</p>}
              <ArrowDown aria-hidden="true" className="lc-flow-arrow" />
              <div className="lc-flow-end">
                <div>
                  <span>剩余应收</span>
                  <strong>{money(node.remainingAmountCents)}</strong>
                </div>
                {actionable ? (
                  <Button onClick={() => onReceipt(node.id)}>
                    {receipts.some((r) => r.status === 'VALID')
                      ? '登记下一笔回款'
                      : '登记回款'}
                  </Button>
                ) : (
                  <span className="lc-table-note">
                    {node.confirmationStatus === 'DRAFT'
                      ? '需市级确认后登记'
                      : '已结清，无需手动核销'}
                  </span>
                )}
              </div>
            </div>
          </details>
        );
      })}
    </section>
  );
}
