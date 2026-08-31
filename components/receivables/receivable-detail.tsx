'use client';

import { BellRing, Paperclip, WalletCards } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RiskBadge, SummaryTile, WriteoffBadge } from './design-system';
import { formatYuan } from '@/lib/domain';
import type { BootstrapData, ReceivableRecord } from '@/lib/types';

const actions = {
  WECHAT: '微信',
  MEETING: '面谈',
  COLLECTION_LETTER: '催收函',
  LAWYER_LETTER: '律师函',
  LITIGATION_LETTER: '诉讼函',
  LEADERSHIP: '领导介入',
};
const baselines = {
  SIGNING: '签约',
  INVOICE: '开票',
  PRE_ACCEPTANCE: '初验',
  FINAL_ACCEPTANCE: '终验',
  OTHER: '其他',
};

export function ReceivableDetail({
  item,
  data,
  onClose,
  onReceipt,
  onCollection,
}: {
  item: ReceivableRecord | null;
  data: BootstrapData;
  onClose: () => void;
  onReceipt: (id: string) => void;
  onCollection: (id: string) => void;
}) {
  if (!item) return null;
  const events = [
    ...data.receipts
      .filter((row) => row.receivableId === item.id)
      .map((row) => ({
        ...row,
        kind: 'receipt',
        date: row.receivedDate,
        title: `回款 ¥${formatYuan(row.amountCents)}`,
      })),
    ...data.collections
      .filter((row) => row.receivableId === item.id)
      .map((row) => ({
        ...row,
        kind: 'collection',
        date: row.actionDate,
        title: `${actions[row.actionType]}催缴`,
      })),
  ].sort(
    (a, b) =>
      b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );
  const actionable =
    item.confirmationStatus === 'CONFIRMED' && item.remainingAmountCents > 0;
  const details = [
    ['项目 / 合同', `${item.projectCode} / ${item.contractCode}`],
    ['归属区县', item.districtName],
    ['付款条件', item.paymentCondition],
    [
      '账期计算',
      `${baselines[item.baselineEvent]} ${item.baselineDate} + ${item.termDays} 天`,
    ],
    ['约定付款日', item.dueDate],
    [
      '验收 / 发票',
      `${item.acceptanceType ?? '未登记验收'} ${item.acceptanceDate ?? ''} · ${item.invoiceStatus ?? '未登记发票'}`,
    ],
    [
      '法律风险',
      item.legalRiskLevel
        ? `${item.legalRiskLevel}级（系统提示，非法律意见）`
        : '无',
    ],
    ['逾期原因', item.overdueReason || '未填写'],
  ];
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader className="pr-6">
          <DialogTitle>{item.projectName}</DialogTitle>
          <DialogDescription>
            {item.receivableCode} · 第 {item.sequenceNo} 节点 ·{' '}
            {item.paymentType}
          </DialogDescription>
          <div className="flex flex-wrap gap-2">
            <RiskBadge item={item} />
            <WriteoffBadge status={item.writeoffStatus} />
          </div>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-3">
          <SummaryTile
            label="节点应收"
            value={`¥${formatYuan(item.amountCents)}`}
          />
          <SummaryTile
            label="有效实收"
            value={`¥${formatYuan(item.receivedAmountCents)}`}
            tone="success"
          />
          <SummaryTile
            label="剩余应收"
            value={`¥${formatYuan(item.remainingAmountCents)}`}
            tone="brand"
          />
        </div>
        <dl className="app-detail-grid">
          {details.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <section aria-labelledby="receivable-history-title">
          <h2 id="receivable-history-title" className="text-sm font-semibold">
            回款与催缴记录{' '}
            <span className="font-normal text-muted-foreground">
              · {events.length} 条
            </span>
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            按业务日期倒序。作废记录保留，不计入实收与风险。
          </p>
          {events.length ? (
            <ol className="app-timeline mt-2">
              {events.map((event) => (
                <li key={event.id} className="app-timeline-item">
                  <span
                    className={`app-timeline-icon ${event.status === 'VOIDED' ? 'is-voided' : ''}`}
                    aria-hidden="true"
                  >
                    {event.kind === 'receipt' ? (
                      <WalletCards className="size-4" />
                    ) : (
                      <BellRing className="size-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{event.title}</span>
                      {event.status === 'VOIDED' ? (
                        <Badge variant="outline">已作废</Badge>
                      ) : null}
                      {event.correctionOfId ? (
                        <Badge variant="outline">更正记录</Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <time dateTime={event.date}>{event.date}</time> ·{' '}
                      {event.createdByName}
                    </p>
                    {event.note ? (
                      <p className="break-words text-xs leading-5">
                        {event.note}
                      </p>
                    ) : null}
                    {event.voidReason ? (
                      <p className="text-xs text-muted-foreground">
                        作废原因：{event.voidReason}
                      </p>
                    ) : null}
                    {event.attachmentId ? (
                      <a
                        className="app-inline-link"
                        href={`/api/attachments/${event.attachmentId}`}
                        download
                      >
                        <Paperclip className="size-3.5" />
                        {event.attachmentName || '下载附件'}
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="app-empty-note mt-3">
              尚无回款或催缴记录，可从下方开始登记。
            </p>
          )}
        </section>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            关闭
          </Button>
          {actionable ? (
            <>
              <Button variant="outline" onClick={() => onCollection(item.id)}>
                <BellRing />
                记录催缴
              </Button>
              <Button onClick={() => onReceipt(item.id)}>
                <WalletCards />
                登记回款
              </Button>
            </>
          ) : null}
          {item.confirmationStatus === 'DRAFT' ? (
            <span className="self-center text-xs text-muted-foreground">
              市级确认后可登记回款
            </span>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
