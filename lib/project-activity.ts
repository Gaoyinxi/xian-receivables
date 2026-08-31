import type { ProjectModel } from './project-lifecycle';
import type { ProjectSection } from './project-navigation';
export const COLLECTION_LABELS = {
  WECHAT: '微信',
  MEETING: '面谈',
  COLLECTION_LETTER: '催收函',
  LAWYER_LETTER: '律师函',
  LITIGATION_LETTER: '诉讼函',
  LEADERSHIP: '领导介入',
};
export type ProjectEvent = {
  id: string;
  date: string;
  title: string;
  actor: string;
  nodeId?: string;
  amount?: number;
  note?: string | null;
  attachmentId?: string | null;
  voided?: boolean;
  planned?: boolean;
  recordedAt?: string;
};

export function projectEvents(model: ProjectModel): ProjectEvent[] {
  const events: ProjectEvent[] = [
    {
      id: 'contract',
      date: model.project.contractDate,
      title: '合同签订日期',
      actor: '合同登记资料',
      amount: model.project.contractAmountCents,
    },
    {
      id: 'created',
      date: model.project.createdAt,
      title: '项目建立',
      actor:
        model.audits.find(
          (a) => a.entityType === 'PROJECT' && a.action === 'CREATE',
        )?.actorName ?? '操作人未载入',
    },
  ];
  for (const node of model.nodes) {
    events.push({
      id: `node:${node.id}`,
      date: node.createdAt,
      title: `第 ${node.sequenceNo} 节点形成应收`,
      nodeId: node.id,
      actor: '付款节点登记',
      amount: node.amountCents,
    });
    const audit = model.audits.find(
      (a) =>
        a.entityType === 'RECEIVABLE' &&
        a.entityId === node.id &&
        a.action === 'CONFIRM',
    );
    const confirmedAt = node.confirmedAt ?? audit?.createdAt;
    if (node.confirmationStatus === 'CONFIRMED' && confirmedAt)
      events.push({
        id: `confirm:${node.id}`,
        date: confirmedAt,
        title: `第 ${node.sequenceNo} 节点应收确认`,
        actor: audit?.actorName ?? '市级管理员（姓名未载入）',
        nodeId: node.id,
        amount: node.amountCents,
      });
    if (node.remainingAmountCents > 0)
      events.push({
        id: `due:${node.id}`,
        date: node.dueDate,
        title: `第 ${node.sequenceNo} 节点约定付款日${node.confirmationStatus === 'DRAFT' ? '（待确认）' : ''}`,
        nodeId: node.id,
        actor: '合同付款计划，非实际到账',
        amount: node.remainingAmountCents,
        planned: true,
      });
  }
  for (const record of model.receipts) {
    events.push({
      id: `receipt:${record.id}`,
      date: record.receivedDate,
      recordedAt: record.createdAt,
      title: `登记回款${record.correctionOfId ? '（更正记录）' : ''}`,
      actor: record.createdByName,
      amount: record.amountCents,
      nodeId: record.receivableId,
      note: record.note,
      attachmentId: record.attachmentId,
      voided: record.status === 'VOIDED',
    });
    if (record.voidedAt)
      events.push({
        id: `void:${record.id}`,
        date: record.voidedAt,
        title: '回款作废并追加更正',
        actor: '原记录保留，不参与金额汇总',
        nodeId: record.receivableId,
        note: record.voidReason,
      });
  }
  for (const record of model.collections) {
    events.push({
      id: `collection:${record.id}`,
      date: record.actionDate,
      recordedAt: record.createdAt,
      title: `${COLLECTION_LABELS[record.actionType]}跟进${record.correctionOfId ? '（更正记录）' : ''}`,
      actor: record.createdByName,
      nodeId: record.receivableId,
      note: record.note,
      attachmentId: record.attachmentId,
      voided: record.status === 'VOIDED',
    });
    if (record.voidedAt)
      events.push({
        id: `void:${record.id}`,
        date: record.voidedAt,
        title: '催缴作废并追加更正',
        actor: '原记录保留，不参与风险计算',
        nodeId: record.receivableId,
        note: record.voidReason,
      });
  }
  for (const file of model.attachments)
    events.push({
      id: `attachment:${file.id}`,
      date: file.createdAt,
      title: `上传${file.entityType === 'PROJECT' ? '合同' : file.entityType === 'RECEIPT' ? '回款' : '催缴'}附件`,
      actor: '附件登记',
      note: file.fileName,
      attachmentId: file.id,
    });
  if (model.project.archivedAt)
    events.push({
      id: 'archive',
      date: model.project.archivedAt,
      title: '已形成应收结清 · 财务归档',
      actor: '系统自动处理',
      amount: model.received,
    });
  return events.sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
}

export type LifecycleStep = {
  id: string;
  label: string;
  section: ProjectSection;
  status: 'done' | 'partial' | 'pending' | 'optional';
  detail: string;
  owner: string;
  time?: string | null;
  timeLabel: string;
  amount: number;
  files: number;
};
export function lifecycleSteps(model: ProjectModel): LifecycleStep[] {
  const effectiveReceipts = model.receipts
    .filter((r) => r.status === 'VALID')
    .toSorted((a, b) => b.receivedDate.localeCompare(a.receivedDate));
  const effectiveCollections = model.collections
    .filter((r) => r.status === 'VALID')
    .toSorted((a, b) => b.actionDate.localeCompare(a.actionDate));
  const confirmed = model.nodes.filter(
    (r) => r.confirmationStatus === 'CONFIRMED',
  );
  const latestConfirmation = confirmed
    .map(
      (r) =>
        r.confirmedAt ??
        model.audits.find(
          (a) =>
            a.entityType === 'RECEIVABLE' &&
            a.entityId === r.id &&
            a.action === 'CONFIRM',
        )?.createdAt,
    )
    .filter((s): s is string => Boolean(s))
    .toSorted()
    .at(-1);
  const countFiles = (type: string) =>
    model.attachments.filter((a) => a.entityType === type).length;
  return [
    {
      id: 'contract',
      label: '合同',
      section: 'contract',
      status: 'done',
      detail: '合同信息已登记',
      owner: '市级管理员',
      time: model.project.contractDate,
      timeLabel: '签订日期',
      amount: model.project.contractAmountCents,
      files: countFiles('PROJECT'),
    },
    {
      id: 'nodes',
      label: '应收',
      section: 'receivables',
      status: model.nodes.length ? 'done' : 'pending',
      detail: `${model.nodes.length} 个付款节点，含待确认`,
      owner: '市级 / 本区管理员',
      time: model.nodes.at(-1)?.createdAt,
      timeLabel: '节点登记',
      amount: model.formed,
      files: 0,
    },
    {
      id: 'confirm',
      label: '确认',
      section: 'receivables',
      status: !confirmed.length
        ? 'pending'
        : model.drafts.length
          ? 'partial'
          : 'done',
      detail: `${confirmed.length} 已确认 · ${model.drafts.length} 待确认`,
      owner: '市级管理员',
      time: latestConfirmation,
      timeLabel: '最近确认',
      amount: model.confirmed,
      files: 0,
    },
    {
      id: 'collection',
      label: '催收',
      section: 'collections',
      status: effectiveCollections.length ? 'done' : 'optional',
      detail: effectiveCollections.length
        ? `${effectiveCollections.length} 条有效跟进`
        : '按需跟进，不阻止回款',
      owner: '本区业务人员',
      time: effectiveCollections[0]?.actionDate,
      timeLabel: '最近有效跟进',
      amount: model.overdue,
      files: countFiles('COLLECTION'),
    },
    {
      id: 'receipt',
      label: '回款',
      section: 'receipts',
      status:
        model.stage === 'SETTLED'
          ? 'done'
          : effectiveReceipts.length
            ? 'partial'
            : 'pending',
      detail: `${effectiveReceipts.length} 笔有效流水`,
      owner: '本区业务人员',
      time: effectiveReceipts[0]?.receivedDate,
      timeLabel: '最近有效到账',
      amount: model.received,
      files: countFiles('RECEIPT'),
    },
    {
      id: 'writeoff',
      label: '核销',
      section: 'receipts',
      status: effectiveReceipts.length ? 'done' : 'pending',
      detail: '每笔有效回款自动冲减余额',
      owner: '系统自动处理',
      time: effectiveReceipts.toSorted((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      )[0]?.createdAt,
      timeLabel: '最近回款入账',
      amount: model.received,
      files: 0,
    },
    {
      id: 'settled',
      label: '结清',
      section: 'receipts',
      status: model.stage === 'SETTLED' ? 'done' : 'pending',
      detail:
        model.stage === 'SETTLED'
          ? '已形成应收全部结清'
          : '全部已确认节点结清后归档',
      owner: '系统自动处理',
      time: model.project.archivedAt,
      timeLabel: '财务归档',
      amount: model.remaining + model.draft,
      files: 0,
    },
  ];
}
