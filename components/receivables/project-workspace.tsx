'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { money, type ProjectModel } from '@/lib/project-lifecycle';
import type { ProjectSection } from '@/lib/project-navigation';
import type {
  BootstrapData,
  CollectionAction,
  CollectionRecord,
  ReceiptRecord,
} from '@/lib/types';
import { StageBadge } from './project-primitives';
import { ProjectNodeWorkspace } from './project-node-workspace';
import { ProjectTaskRail } from './project-task-rail';

export type ProjectOperations = {
  onNode: () => void;
  onConfirm: (id: string) => void;
  onReceipt: (id: string) => void;
  onCollection: (id: string, action?: CollectionAction) => void;
  onCorrectReceipt: (record: ReceiptRecord) => void;
  onCorrectCollection: (record: CollectionRecord) => void;
};

function ProjectOverview({
  model,
  onBack,
  onOpenNode,
  onOpenNext,
  onCreateNode,
}: {
  model: ProjectModel;
  onBack: () => void;
  onOpenNode: (nodeId: string) => void;
  onOpenNext: () => void;
  onCreateNode: () => void;
}) {
  return (
    <div className="lc-workspace lc-project-overview">
      <header className="lc-project-header lc-project-overview-header">
        <nav className="lc-project-breadcrumb" aria-label="项目位置">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft />
            项目
          </Button>
          <span aria-hidden="true">/</span>
          <strong aria-current="page">项目概览</strong>
        </nav>
        <div className="lc-project-title">
          <div>
            <p>
              {model.project.projectCode} · {model.project.districtName} ·{' '}
              {model.project.customerName}
            </p>
            <h1>{model.project.name}</h1>
          </div>
          <StageBadge stage={model.stage} />
        </div>
        <p className="lc-project-key-amount">
          当前剩余应收 <strong>{money(model.remaining)}</strong>
          {model.draft > 0 && <span> · 待确认 {money(model.draft)}</span>}
        </p>
      </header>
      <div className="lc-project-next-line">
        <div>
          <span>当前任务</span>
          <p>{model.next.reason}</p>
        </div>
        <Button onClick={model.nodes.length ? onOpenNext : onCreateNode}>
          {model.next.label}
          <ArrowRight />
        </Button>
      </div>
      <main className="lc-project-overview-main" aria-label="项目付款节点任务链">
        <ProjectTaskRail
          model={model}
          onOpenNode={onOpenNode}
          onCreateNode={onCreateNode}
        />
      </main>
    </div>
  );
}

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
  const focused = model.nodes.find((node) => node.id === focusedNodeId);
  if (focused)
    return (
      <ProjectNodeWorkspace
        model={model}
        data={data}
        node={focused}
        today={today}
        confirmingId={confirmingId}
        onOverview={() => onSection('overview')}
        onDone={onDone}
        operations={operations}
      />
    );

  const openNext = () => {
    if (model.next.receivableId)
      onSection('receivables', model.next.receivableId);
    else if (model.next.kind === 'node') operations.onNode();
    else onSection(model.next.section);
  };
  return (
    <div data-opened-section={section}>
      {focusedNodeId ? (
        <section className="lc-section">
          <p className="lc-empty">
            指定的付款节点不属于此项目或已不可用；没有自动打开其他节点。
          </p>
          <Button
            className="m-4"
            variant="outline"
            onClick={() => onSection('overview')}
          >
            返回项目概览
          </Button>
        </section>
      ) : (
        <ProjectOverview
          model={model}
          onBack={onBack}
          onOpenNode={(nodeId) => onSection('receivables', nodeId)}
          onOpenNext={openNext}
          onCreateNode={operations.onNode}
        />
      )}
    </div>
  );
}
