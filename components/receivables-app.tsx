'use client';

import * as React from 'react';
import { ProjectSwitcher } from '@/components/receivables/project-switcher';
import { workspaceService } from '@/services/workspace';
import { useWorkspaceData } from '@/hooks/use-workspace-data';
import {
  WorkspaceStatus,
  WorkspaceSkeleton,
} from '@/components/receivables/workspace-status';
import { BusinessCockpit } from '@/components/receivables/business-cockpit';
import { ProjectDirectory } from '@/components/receivables/project-directory';
import { ProjectWorkspace } from '@/components/receivables/project-workspace';
import { WorkspaceNavigation } from '@/components/receivables/workspace-navigation';
import { AccountScopeView } from '@/components/receivables/global-insights';
import { buildPortfolio, shanghaiDate } from '@/lib/project-lifecycle';
import {
  VIEW_TITLES,
  type View,
  type WorkspaceRoute,
  type ProjectSection,
} from '@/lib/project-navigation';
import { useWorkspaceRouter } from '@/hooks/use-workspace-router';
import { AlertTriangle, CircleCheckBig, RefreshCw, X } from 'lucide-react';
import { EmptyState } from '@/components/receivables/design-system';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type {
  CollectionAction,
  CollectionRecord,
  ReceiptRecord,
  Role,
} from '@/lib/types';
import {
  IdentityControls,
  ApplicationHeader,
} from '@/components/receivables/application-header';
const ImportView = React.lazy(() =>
  import('@/components/receivables/views/import-view').then((module) => ({
    default: module.ImportView,
  })),
);
import { ProjectDialog } from '@/components/receivables/forms/project-dialog';
import { NodeDialog } from '@/components/receivables/forms/node-dialog';
import { ReceiptDialog } from '@/components/receivables/forms/receipt-dialog';
import { ReceiptCorrectionDialog } from '@/components/receivables/forms/receipt-correction-dialog';
import { CollectionDialog } from '@/components/receivables/forms/collection-dialog';
import { CollectionCorrectionDialog } from '@/components/receivables/forms/collection-correction-dialog';

export type Notice = {
  type: 'success' | 'error';
  title: string;
  message: string;
};

export function ReceivablesApp({
  initialRoute,
}: {
  initialRoute?: WorkspaceRoute;
} = {}) {
  const {
    data,
    loading,
    refreshing,
    error: loadError,
    updatedAt,
    load,
    resetIdentity,
  } = useWorkspaceData();
  const [switchingIdentity, setSwitchingIdentity] = React.useState(false);
  const identityRevision = React.useRef(0);
  const epoch = identityRevision.current;
  React.useEffect(
    () => () => {
      identityRevision.current++;
    },
    [],
  );
  const { route, pushRoute, replaceRoute } = useWorkspaceRouter(initialRoute);
  const view = route.view;
  const [contextProjectId, setContextProjectId] = React.useState<string | null>(
    null,
  );
  const [collectionInitialAction, setCollectionInitialAction] =
    React.useState<CollectionAction>('WECHAT');
  const [notice, setNotice] = React.useState<Notice | null>(null);
  const [nodeDialog, setNodeDialog] = React.useState(false);
  const [receiptDialog, setReceiptDialog] = React.useState(false);
  const [receiptCorrection, setReceiptCorrection] =
    React.useState<ReceiptRecord | null>(null);
  const [collectionDialog, setCollectionDialog] = React.useState(false);
  const [collectionCorrection, setCollectionCorrection] =
    React.useState<CollectionRecord | null>(null);
  const [operationTarget, setOperationTarget] = React.useState<string | null>(
    null,
  );
  const [confirmingId, setConfirmingId] = React.useState<string | null>(null);
  const identitySwitch = React.useRef(false);

  function navigate(next: View) {
    pushRoute({ view: next });
  }
  function openProject(
    projectId: string,
    section: ProjectSection = 'overview',
    receivableId?: string,
  ) {
    if (identityRevision.current !== epoch) return;
    pushRoute({ view: 'projects', projectId, section, receivableId });
  }
  function openOperation(
    kind: 'node' | 'receipt' | 'collection',
    projectId: string | null,
    id: string | null = null,
    action: CollectionAction = 'WECHAT',
  ) {
    setNodeDialog(kind === 'node');
    setReceiptDialog(kind === 'receipt');
    setCollectionDialog(kind === 'collection');
    setReceiptCorrection(null);
    setCollectionCorrection(null);
    setContextProjectId(projectId);
    setOperationTarget(id);
    setCollectionInitialAction(action);
  }

  function openNewProject() {
    pushRoute(
      { view: 'projects', newProject: true },
      {
        receivablesModal: true,
        receivablesReturnTo: `${window.location.pathname}${window.location.search}`,
      },
    );
  }

  function closeNewProject() {
    if (window.history.state?.receivablesModal) window.history.back();
    else replaceRoute({ view: 'projects' });
  }

  React.useEffect(() => {
    document.title = `${VIEW_TITLES[view]} · 项目应收管理系统`;
  }, [view]);

  const done = React.useCallback(
    async (message: string) => {
      if (identityRevision.current !== epoch) return;
      setNotice({ type: 'success', title: '操作成功', message });
      await load(true);
    },
    [load, epoch],
  );

  async function changeIdentity(role: Role, districtCode?: string | null) {
    if (identitySwitch.current) return;
    identitySwitch.current = true;
    setSwitchingIdentity(true);
    identityRevision.current++;
    resetIdentity();
    if (route.newProject) replaceRoute({ view: 'projects' });
    setNodeDialog(false);
    setReceiptDialog(false);
    setCollectionDialog(false);
    setReceiptCorrection(null);
    setCollectionCorrection(null);
    setContextProjectId(null);
    setOperationTarget(null);
    setConfirmingId(null);
    try {
      await workspaceService.changeDemoIdentity(role, districtCode);
      setNotice({
        type: 'success',
        title: '身份已切换',
        message:
          role === 'CITY_ADMIN'
            ? '当前可查看全部区县数据'
            : `当前仅可处理${districtCode ?? ''}对应区县数据`,
      });
      navigate('projects');
    } catch (error) {
      setNotice({
        type: 'error',
        title: '身份切换失败',
        message: error instanceof Error ? error.message : '请稍后重试',
      });
    } finally {
      identitySwitch.current = false;
      setSwitchingIdentity(false);
      await load();
    }
  }

  const models = React.useMemo(
    () => (data ? buildPortfolio(data) : []),
    [data],
  );
  const currentProject = route.projectId
    ? models.find((model) => model.project.id === route.projectId)
    : undefined;
  const today = data?.businessDate ?? shanghaiDate();

  async function confirmReceivable(id: string) {
    if (confirmingId) return;
    setConfirmingId(id);
    try {
      await workspaceService.confirm(id);
      await done('应收已确认，项目状态已更新，现在可以登记回款');
    } catch (error) {
      if (identityRevision.current !== epoch) return;
      setNotice({
        type: 'error',
        title: '确认失败',
        message: error instanceof Error ? error.message : '请稍后重试',
      });
    } finally {
      if (identityRevision.current === epoch) setConfirmingId(null);
    }
  }

  if (!loading && !data) {
    return (
      <main className="app-loading-screen">
        <section
          className="app-panel max-w-md p-6"
          aria-labelledby="load-error-title"
        >
          <AlertTriangle
            className="mb-3 size-6 text-destructive"
            aria-hidden="true"
          />
          <h1 id="load-error-title" className="text-lg font-semibold">
            暂时无法载入工作台
          </h1>
          <p
            role="alert"
            className="my-3 text-sm leading-6 text-muted-foreground"
          >
            {loadError ||
              notice?.message ||
              '请检查网络连接后重试，已有数据不会被清除。'}
          </p>
          <Button onClick={() => void load()}>
            <RefreshCw />
            重新加载
          </Button>
        </section>
      </main>
    );
  }

  if (loading || !data) return <WorkspaceSkeleton />;

  const content = route.notFound ? (
    <section className="lc-section">
      <EmptyState
        title="页面不存在"
        description="链接无效或页面已调整。请返回工作台继续处理。"
      />
      <Button className="m-4" onClick={() => navigate('projects')}>
        返回项目总览
      </Button>
    </section>
  ) : route.projectId ? (
    currentProject ? (
      <ProjectWorkspace
        key={currentProject.project.id}
        model={currentProject}
        data={data}
        section={route.section ?? 'overview'}
        focusedNodeId={route.receivableId}
        today={today}
        confirmingId={confirmingId}
        onBack={() => navigate('projects')}
        onSection={(section, nodeId) =>
          openProject(currentProject.project.id, section, nodeId)
        }
        onDone={done}
        operations={{
          onNode: () => openOperation('node', currentProject.project.id),
          onConfirm: (id) => void confirmReceivable(id),
          onReceipt: (id) =>
            openOperation('receipt', currentProject.project.id, id),
          onCollection: (id, action) =>
            openOperation('collection', currentProject.project.id, id, action),
          onCorrectReceipt: (record) => setReceiptCorrection(record),
          onCorrectCollection: (record) => setCollectionCorrection(record),
        }}
      />
    ) : (
      <section className="lc-section">
        <EmptyState
          title="项目不可用"
          description="项目不存在或不在当前账号的数据范围中；没有自动打开其他项目。"
        />
        <Button
          variant="outline"
          className="m-4"
          onClick={() => navigate('projects')}
        >
          返回项目列表
        </Button>
      </section>
    )
  ) : route.importing ? (
    <ImportView data={data} onDone={done} onBack={() => navigate('projects')} />
  ) : (
    {
      dashboard: (
        <BusinessCockpit
          data={data}
          models={models}
          today={today}
          onOpen={openProject}
          onNew={openNewProject}
          onProjects={() => navigate('projects')}
        />
      ),
      projects: (
        <ProjectDirectory
          key="active"
          data={data}
          models={models}
          onOpen={openProject}
          onNew={openNewProject}
          onImport={() => pushRoute({ view: 'projects', importing: true })}
          onArchiveChange={(archived) =>
            navigate(archived ? 'history' : 'projects')
          }
          onAction={(model) => {
            if (model.next.kind === 'node')
              openOperation('node', model.project.id);
            else if (model.next.kind === 'receipt')
              openOperation(
                'receipt',
                model.project.id,
                model.next.receivableId,
              );
            else if (model.next.kind === 'collection')
              openOperation(
                'collection',
                model.project.id,
                model.next.receivableId,
              );
            else if (model.next.kind === 'confirm' && model.next.receivableId)
              void confirmReceivable(model.next.receivableId);
            else
              openProject(
                model.project.id,
                model.next.section,
                model.next.receivableId,
              );
          }}
        />
      ),
      history: (
        <ProjectDirectory
          key="history"
          data={data}
          models={models}
          archived
          onOpen={openProject}
          onNew={openNewProject}
          onImport={() => pushRoute({ view: 'projects', importing: true })}
          onArchiveChange={(archived) =>
            navigate(archived ? 'history' : 'projects')
          }
          onAction={(model) =>
            openProject(
              model.project.id,
              model.next.section,
              model.next.receivableId,
            )
          }
        />
      ),
      account: <AccountScopeView data={data} onDone={done} />,
    }[view]
  );

  return (
    <div
      className="app-shell"
      data-view={view}
      key={`${data.session.role}:${data.session.districtId}`}
    >
      <a className="app-skip-link" href="#main-content">
        跳转到主要内容
      </a>
      <WorkspaceNavigation
        view={view}
        onNavigate={navigate}
        data={data}
        onNew={openNewProject}
        onImport={() => pushRoute({ view: 'projects', importing: true })}
        onOpen={openProject}
      />

      <div className="app-workspace-body">
        <ApplicationHeader
          route={route}
          data={data}
          refreshing={refreshing || switchingIdentity}
          onRefresh={() => void load(true)}
          onChangeIdentity={(role, districtCode) =>
            void changeIdentity(role, districtCode)
          }
        >
          <ProjectSwitcher projects={data.projects} onOpen={openProject} />
        </ApplicationHeader>
        <div className="app-mobile-context flex items-center gap-2 overflow-x-auto px-4 py-2 md:hidden">
          <IdentityControls
            data={data}
            compact
            onChange={(role, districtCode) =>
              void changeIdentity(role, districtCode)
            }
          />
        </div>
        <WorkspaceNavigation view={view} onNavigate={navigate} mobile />

        <main
          id="main-content"
          tabIndex={-1}
          className="app-main lc-main"
          aria-busy={refreshing}
        >
          <WorkspaceStatus
            refreshing={refreshing}
            error={loadError}
            updatedAt={updatedAt}
            onRetry={() => void load(true)}
          />
          {notice ? (
            <Alert
              role={notice.type === 'error' ? 'alert' : 'status'}
              aria-live={notice.type === 'error' ? 'assertive' : 'polite'}
              data-tone={notice.type === 'success' ? 'success' : 'danger'}
              className="app-callout mb-4"
            >
              {notice.type === 'success' ? (
                <CircleCheckBig />
              ) : (
                <AlertTriangle />
              )}
              <AlertTitle>{notice.title}</AlertTitle>
              <AlertDescription className="text-current/80">
                {notice.message}
              </AlertDescription>
              <Button
                variant="ghost"
                size="icon-xs"
                className="absolute right-2 top-2"
                aria-label="关闭提示"
                onClick={() => setNotice(null)}
              >
                <X />
              </Button>
            </Alert>
          ) : null}
          <React.Suspense
            key={route.projectId ?? view}
            fallback={
              <output className="lc-empty" aria-live="polite">
                正在载入当前工作区…
              </output>
            }
          >
            {content}
          </React.Suspense>
        </main>
      </div>

      <ProjectDialog
        key={route.newProject ? 'project-open' : 'project-closed'}
        open={Boolean(route.newProject)}
        data={data}
        onOpenChange={(open) => !open && closeNewProject()}
        onDone={done}
        onCreated={(id) =>
          replaceRoute({
            view: 'projects',
            projectId: id,
            section: 'receivables',
          })
        }
      />
      <NodeDialog
        key={nodeDialog ? `node-open-${contextProjectId}` : 'node-closed'}
        open={nodeDialog}
        data={data}
        contextProjectId={contextProjectId}
        onOpenChange={setNodeDialog}
        onDone={done}
      />
      <ReceiptDialog
        key={
          receiptDialog ? `receipt-open-${operationTarget}` : 'receipt-closed'
        }
        open={receiptDialog}
        data={data}
        contextProjectId={contextProjectId}
        initialReceivableId={operationTarget}
        onOpenChange={setReceiptDialog}
        onDone={done}
      />
      <ReceiptCorrectionDialog
        key={receiptCorrection?.id ?? 'receipt-correction-closed'}
        record={
          data.receipts.find((row) => row.id === receiptCorrection?.id) ?? null
        }
        data={data}
        onOpenChange={(open) => !open && setReceiptCorrection(null)}
        onDone={done}
      />
      <CollectionDialog
        key={
          collectionDialog
            ? `collection-open-${operationTarget}`
            : 'collection-closed'
        }
        open={collectionDialog}
        data={data}
        contextProjectId={contextProjectId}
        initialAction={collectionInitialAction}
        initialReceivableId={operationTarget}
        onOpenChange={setCollectionDialog}
        onDone={done}
      />
      <CollectionCorrectionDialog
        key={collectionCorrection?.id ?? 'collection-correction-closed'}
        record={
          data.collections.find((row) => row.id === collectionCorrection?.id) ??
          null
        }
        data={data}
        onOpenChange={(open) => !open && setCollectionCorrection(null)}
        onDone={done}
      />
    </div>
  );
}
