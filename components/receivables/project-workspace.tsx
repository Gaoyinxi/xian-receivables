'use client';
import { ArrowLeft, ArrowRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { canManageReceivable, canCreateOperationalRecord } from '@/lib/domain';
import {
  dateTime,
  money,
  nextForNode,
  type NextAction,
  type ProjectModel,
} from '@/lib/project-lifecycle';
import {
  PROJECT_SECTIONS,
  type ProjectSection,
} from '@/lib/project-navigation';
import type {
  BootstrapData,
  CollectionAction,
  CollectionRecord,
  ReceiptRecord,
} from '@/lib/types';
import { StageBadge, RISK_LABELS } from './project-primitives';
import {
  LifecycleTrack,
  LifecycleEvidence,
  ProjectTimeline,
} from './project-timeline';
import { ProjectMoney, ProjectReceipts } from './project-money';
import { ProjectRisk } from './project-risk';
import { ProjectContract } from './project-contract';
import {
  ProjectNodes,
  ProjectCollections,
  ProjectAudit,
} from './project-records';

export type ProjectOperations = {
  onNode: () => void;
  onConfirm: (id: string) => void;
  onReceipt: (id: string) => void;
  onCollection: (id: string, action?: CollectionAction) => void;
  onCorrectReceipt: (record: ReceiptRecord) => void;
  onCorrectCollection: (record: CollectionRecord) => void;
};
export function ProjectWorkspace({
  model,
  data,
  section,
  focusedNodeId,
  today,
  confirmingId,
  onBack,
  onSection,
  onDone,
  operations,
}: {
  model: ProjectModel;
  data: BootstrapData;
  section: ProjectSection;
  focusedNodeId?: string;
  today: string;
  confirmingId: string | null;
  onBack: () => void;
  onSection: (section: ProjectSection, nodeId?: string) => void;
  onDone: (message: string) => Promise<void>;
  operations: ProjectOperations;
}) {
  const session = data.session;
  const focused = model.nodes.find((r) => r.id === focusedNodeId);
  const missingNode = Boolean(focusedNodeId && !focused);
  const next = focused ? nextForNode(focused, session) : model.next;
  const canNode = canManageReceivable(
    session.role,
    session.districtId,
    model.project.districtId,
  );
  const receiptTarget = focusedNodeId
    ? model.open.find((r) => r.id === focusedNodeId)
    : model.open[0];
  function act(action: NextAction) {
    if (missingNode) return;
    if (action.kind === 'node') operations.onNode();
    else if (action.kind === 'confirm' && action.receivableId)
      operations.onConfirm(action.receivableId);
    else if (action.kind === 'collection' && action.receivableId)
      operations.onCollection(action.receivableId);
    else if (action.kind === 'receipt' && action.receivableId)
      operations.onReceipt(action.receivableId);
    else onSection(action.section, action.receivableId);
  }
  return (
    <div className="lc-workspace">
      <header className="lc-project-header">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft />
          返回项目列表
        </Button>
        <div className="lc-project-title">
          <div>
            <p>
              {model.project.projectCode} · {model.project.districtName} ·{' '}
              {model.project.customerName}
            </p>
            <h1>{model.project.name}</h1>
          </div>
          <div className="lc-project-badges">
            <StageBadge stage={model.stage} />
            <button
              className="lc-risk-link"
              data-risk={model.risk}
              onClick={() => onSection('risk')}
            >
              {RISK_LABELS[model.risk]} ↗
            </button>
          </div>
        </div>
        <dl className="lc-project-totals">
          {[
            ['合同金额', model.project.contractAmountCents],
            ['已形成应收', model.formed],
            ['已回款', model.received],
            ['剩余应收', model.remaining],
          ].map(([label, amount]) => (
            <div key={String(label)}>
              <dt>{label}</dt>
              <dd>{money(Number(amount))}</dd>
            </div>
          ))}
        </dl>
        <div className="lc-project-meta">
          <span>
            业务状态：{model.project.status} ·{' '}
            {model.project.archivedAt ? '财务已归档' : '财务进行中'}
          </span>
          <span>
            {model.draft > 0
              ? `另有待确认 ${money(model.draft)}，不计入剩余应收。`
              : '剩余应收为已确认口径。'}
          </span>
          <span>最近操作记录：{dateTime(model.lastActivity)}</span>
        </div>
      </header>
      <LifecycleTrack
        model={model}
        section={section}
        onSection={(s) => onSection(s, focusedNodeId)}
      />
      <div className="lc-next-action">
        <div>
          <span className="lc-eyebrow">
            {missingNode
              ? '节点不可用'
              : `当前状态 · ${model.stage === 'SETTLED' ? '已形成应收结清' : focused?.confirmationStatus === 'DRAFT' ? '此应收待确认' : next.kind === 'collection' ? '逾期跟进' : next.label}`}
          </span>
          <p>
            {missingNode
              ? '链接中的节点不属于此项目或已不可用；不会自动切换到其他节点。'
              : next.reason}
          </p>
          <small>
            处理权限：{next.responsible}。这是操作权限说明，不代表人员任务分派。
          </small>
        </div>
        <div className="lc-inline-actions">
          {missingNode ? (
            <Button variant="outline" onClick={() => onSection('receivables')}>
              查看本项目节点
            </Button>
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
          {!missingNode &&
            receiptTarget &&
            next.kind === 'collection' &&
            canCreateOperationalRecord(
              session.role,
              session.districtId,
              model.project.districtId,
            ) && (
              <Button
                variant="outline"
                onClick={() => operations.onReceipt(receiptTarget.id)}
              >
                登记实际回款
              </Button>
            )}
          {!missingNode && canNode && model.nodes.length > 0 && (
            <Button variant="ghost" onClick={operations.onNode}>
              <Plus />
              增加节点
            </Button>
          )}
        </div>
      </div>
      <Tabs
        value={section}
        onValueChange={(value) =>
          onSection(value as ProjectSection, focusedNodeId)
        }
      >
        <TabsList
          variant="line"
          className="lc-project-tabs"
          aria-label="项目工作区域"
        >
          {Object.entries(PROJECT_SECTIONS).map(([key, label]) => (
            <TabsTrigger key={key} value={key}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview">
          <ProjectMoney model={model} />
          <LifecycleEvidence model={model} onSection={onSection} />
          <ProjectTimeline
            model={model}
            today={today}
            onNode={(id) => onSection('receivables', id)}
          />
        </TabsContent>
        <TabsContent value="contract">
          <ProjectContract model={model} session={session} onDone={onDone} />
        </TabsContent>
        <TabsContent value="receivables">
          <ProjectNodes
            model={model}
            session={session}
            focusedNodeId={focusedNodeId}
            confirmingId={confirmingId}
            onNode={operations.onNode}
            onConfirm={operations.onConfirm}
            onReceipt={operations.onReceipt}
            onCollection={operations.onCollection}
          />
        </TabsContent>
        <TabsContent value="collections">
          <ProjectCollections
            model={model}
            session={session}
            focusedNodeId={focusedNodeId}
            onNew={operations.onCollection}
            onCorrect={operations.onCorrectCollection}
          />
        </TabsContent>
        <TabsContent value="receipts">
          <ProjectReceipts
            model={model}
            session={session}
            focusedNodeId={
              focusedNodeId ?? model.open[0]?.id ?? model.nodes[0]?.id
            }
            onReceipt={operations.onReceipt}
            onCorrect={operations.onCorrectReceipt}
          />
        </TabsContent>
        <TabsContent value="risk">
          <ProjectRisk
            model={model}
            data={data}
            today={today}
            onCollection={operations.onCollection}
          />
        </TabsContent>
        <TabsContent value="audit">
          <ProjectAudit model={model} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
