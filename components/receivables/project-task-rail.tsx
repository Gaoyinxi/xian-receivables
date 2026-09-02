'use client';

import { ArrowRight, Plus } from 'lucide-react';
import { money, type ProjectModel } from '@/lib/project-lifecycle';

type TaskState = {
  label: string;
  tone: 'pending' | 'overdue' | 'partial' | 'settled' | 'normal';
  detail: string;
};

function taskState(node: ProjectModel['nodes'][number]): TaskState {
  if (node.confirmationStatus === 'DRAFT')
    return {
      label: '待确认',
      tone: 'pending',
      detail: '市级管理员确认后才能登记回款。',
    };
  if (node.remainingAmountCents <= 0)
    return {
      label: '已结清',
      tone: 'settled',
      detail: '有效回款已自动核销，记录与更正仍可追溯。',
    };
  if (node.overdueDays > 0)
    return {
      label: `逾期 ${node.overdueDays} 天`,
      tone: 'overdue',
      detail: '应优先留存催收跟进，也可以直接登记实际回款。',
    };
  if (node.receivedAmountCents > 0)
    return {
      label: '部分回款',
      tone: 'partial',
      detail: '已有有效回款，仍可继续登记下一笔到账。',
    };
  return {
    label: '待回款',
    tone: 'normal',
    detail: '应收已确认，实际到账后登记回款即可自动核销。',
  };
}

export function ProjectTaskRail({
  model,
  onOpenNode,
  onCreateNode,
}: {
  model: ProjectModel;
  onOpenNode: (nodeId: string) => void;
  onCreateNode: () => void;
}) {
  return (
    <section className="lc-task-rail-section" aria-labelledby="task-rail-title">
      <div className="lc-task-rail-heading">
        <div>
          <h2 id="task-rail-title">付款节点任务链</h2>
          <p>将鼠标悬停在节点上查看摘要，点击进入处理页。</p>
        </div>
        <span>{model.nodes.length} 个节点</span>
      </div>
      {!model.nodes.length ? (
        <button
          type="button"
          className="lc-task-card lc-task-card--setup"
          data-task-card="setup"
          onClick={onCreateNode}
        >
          <span className="lc-task-card-index">开始</span>
          <strong>建立付款节点</strong>
          <span>合同已登记，下一步建立第一笔应收。</span>
          <Plus aria-hidden="true" className="size-4" />
        </button>
      ) : (
        <ol className="lc-task-rail" aria-label="付款节点处理链">
          {model.nodes.map((node) => {
            const state = taskState(node);
            return (
              <li
                key={node.id}
                className="lc-task-rail-item"
                data-current={node.id === model.next.receivableId}
              >
                <button
                  type="button"
                  className="lc-task-card"
                  data-task-card={node.id}
                  data-tone={state.tone}
                  onClick={() => onOpenNode(node.id)}
                  aria-label={`第 ${node.sequenceNo} 节点，${node.paymentType}，${state.label}。点击进入处理页。`}
                >
                  <span className="lc-task-card-topline">
                    <span>节点 {String(node.sequenceNo).padStart(2, '0')}</span>
                    <span className="lc-task-state">{state.label}</span>
                  </span>
                  <strong>{node.paymentType}</strong>
                  <span className="lc-task-card-amount">{money(node.amountCents)}</span>
                  <span className="lc-task-card-hover">
                    <span>{node.dueDate} 到期 · 剩余 {money(node.remainingAmountCents)}</span>
                    <span>{state.detail}</span>
                    <span className="lc-task-open">进入处理页 <ArrowRight aria-hidden="true" className="size-3" /></span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
