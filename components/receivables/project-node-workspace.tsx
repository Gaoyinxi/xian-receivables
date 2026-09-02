'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { canCreateOperationalRecord } from '@/lib/domain';
import {
  money,
  nextForNode,
  type ProjectModel,
  type NextAction,
} from '@/lib/project-lifecycle';
import type { BootstrapData, ReceivableRecord } from '@/lib/types';
import { ProjectContract } from './project-contract';
import { ProjectReceipts } from './project-money';
import { ProjectAudit, ProjectCollections, ProjectNodes } from './project-records';
import { ProjectRisk } from './project-risk';
import { ProjectTimeline } from './project-timeline';
import { RiskBadge, WriteoffBadge } from './design-system';
import type { ProjectOperations } from './project-workspace';

export function ProjectNodeWorkspace({
  model,
  data,
  node,
  today,
  confirmingId,
  onOverview,
  onDone,
  operations,
}: {
  model: ProjectModel;
  data: BootstrapData;
  node: ReceivableRecord;
  today: string;
  confirmingId: string | null;
  onOverview: () => void;
  onDone: (message: string) => Promise<void>;
  operations: ProjectOperations;
}) {
  const next = nextForNode(node, data.session);
  function act(action: NextAction) {
    if (action.kind === 'node') operations.onNode();
    else if (action.kind === 'confirm' && action.receivableId)
      operations.onConfirm(action.receivableId);
    else if (action.kind === 'collection' && action.receivableId)
      operations.onCollection(action.receivableId);
    else if (action.kind === 'receipt' && action.receivableId)
      operations.onReceipt(action.receivableId);
  }
  const canRegisterReceipt =
    next.kind === 'collection' &&
    node.remainingAmountCents > 0 &&
    canCreateOperationalRecord(
      data.session.role,
      data.session.districtId,
      model.project.districtId,
    );

  return (
    <div className="lc-workspace lc-node-workspace">
      <header className="lc-project-header lc-node-page-header">
        <nav className="lc-project-breadcrumb" aria-label="项目位置">
          <Button variant="ghost" size="sm" onClick={onOverview}>
            <ArrowLeft />
            项目概览
          </Button>
          <span aria-hidden="true">/</span>
          <strong aria-current="page">节点详情</strong>
        </nav>
        <div className="lc-project-title">
          <div>
            <p>{model.project.projectCode} · {model.project.name}</p>
            <h1>第 {node.sequenceNo} 节点 · {node.paymentType}</h1>
          </div>
          <div className="lc-project-badges">
            <RiskBadge item={node} />
            {node.confirmationStatus === 'CONFIRMED' && (
              <WriteoffBadge status={node.writeoffStatus} />
            )}
          </div>
        </div>
        <dl className="lc-node-page-totals">
          <div>
            <dt>应收金额</dt>
            <dd>{money(node.amountCents)}</dd>
          </div>
          <div>
            <dt>已回款</dt>
            <dd>{money(node.receivedAmountCents)}</dd>
          </div>
          <div>
            <dt>剩余应收</dt>
            <dd>{money(node.remainingAmountCents)}</dd>
          </div>
        </dl>
      </header>
      <div className="lc-next-action">
        <div>
          <span className="lc-eyebrow">当前任务</span>
          <p>{next.reason}</p>
          <small>处理权限：{next.responsible}</small>
        </div>
        <div className="lc-inline-actions">
          {next.kind === 'view' ? (
            <span className="lc-table-note">当前节点已打开；无额外可执行操作。</span>
          ) : (
            <Button
              disabled={Boolean(confirmingId)}
              aria-busy={Boolean(confirmingId)}
              onClick={() => act(next)}
            >
              {confirmingId ? '正在确认…' : next.label}
              <ArrowRight />
            </Button>
          )}
          {canRegisterReceipt && (
            <Button variant="outline" onClick={() => operations.onReceipt(node.id)}>
              登记实际回款
            </Button>
          )}
        </div>
      </div>
      <main className="lc-node-detail" aria-label="付款节点详情">
        <ProjectNodes
          model={model}
          session={data.session}
          focusedNodeId={node.id}
          nodeId={node.id}
          confirmingId={confirmingId}
          onNode={operations.onNode}
          onConfirm={operations.onConfirm}
          onReceipt={operations.onReceipt}
          onCollection={operations.onCollection}
        />
        <ProjectTimeline
          model={model}
          today={today}
          nodeId={node.id}
          onNode={() => undefined}
        />
        <details className="lc-flow-details">
          <summary>回款、催收与更正记录</summary>
          <ProjectReceipts
            model={model}
            session={data.session}
            focusedNodeId={node.id}
            nodeId={node.id}
            onReceipt={operations.onReceipt}
            onCorrect={operations.onCorrectReceipt}
          />
          <ProjectCollections
            model={model}
            session={data.session}
            focusedNodeId={node.id}
            nodeId={node.id}
            onNew={operations.onCollection}
            onCorrect={operations.onCorrectCollection}
          />
        </details>
        <details className="lc-flow-details">
          <summary>项目资料、风险与审计</summary>
          <ProjectContract model={model} session={data.session} onDone={onDone} />
          <ProjectRisk
            model={model}
            data={data}
            today={today}
            onCollection={operations.onCollection}
          />
          <ProjectAudit model={model} />
        </details>
      </main>
    </div>
  );
}
