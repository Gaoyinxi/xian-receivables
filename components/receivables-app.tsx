'use client';

import * as React from 'react';
import { apiRequest, ApiClientError } from '@/lib/api-client';
import { AccountIdentity } from '@/components/receivables/account-context';
import { BusinessCockpit } from '@/components/receivables/business-cockpit';
import { ProjectDirectory } from '@/components/receivables/project-directory';
import { ProjectWorkspace } from '@/components/receivables/project-workspace';
import {
  WorkspaceNavigation,
  WorkspaceSubnav,
} from '@/components/receivables/workspace-navigation';
import {
  GlobalRiskView,
  AccountScopeView,
} from '@/components/receivables/global-insights';
import { buildPortfolio, shanghaiDate } from '@/lib/project-lifecycle';
import {
  contextualCandidates,
  parseWorkspaceHash,
  projectHash,
  VIEW_TITLES,
  type View,
  type WorkspaceRoute,
  type ProjectSection,
} from '@/lib/project-navigation';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import {
  filterReceivables,
  receivablesCsv,
  RECEIVABLE_FILTERS,
  type ReceivableFilter,
} from '@/lib/workbench';
import {
  AlertTriangle,
  BellRing,
  Check,
  CircleCheckBig,
  CircleDollarSign,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  Paperclip,
  PencilLine,
  Plus,
  RefreshCw,
  UploadCloud,
  X,
} from 'lucide-react';

import {
  DataPanel,
  EmptyState,
  ErrorText,
  FormField,
  PageHeading,
  RiskBadge,
  SearchField,
  SummaryTile,
  WriteoffBadge,
} from '@/components/receivables/design-system';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type {
  BootstrapData,
  CollectionAction,
  CollectionRecord,
  ImportKind,
  ReceiptRecord,
  ReceivableRecord,
  Role,
  RowError,
} from '@/lib/types';

type Notice = { type: 'success' | 'error'; title: string; message: string };

function formatYuan(cents: number): string {
  return `¥${(cents / 100).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

const roleLabels: Record<Role, string> = {
  CITY_ADMIN: '市级管理员',
  DISTRICT_ADMIN: '区县管理员',
  DISTRICT_OPERATOR: '区县填报人',
};

const actionLabels: Record<CollectionAction, string> = {
  WECHAT: '微信',
  MEETING: '面谈',
  COLLECTION_LETTER: '催收函',
  LAWYER_LETTER: '律师函',
  LITIGATION_LETTER: '诉讼函',
  LEADERSHIP: '领导介入',
};

function requiresCollectionAttachment(action: CollectionAction): boolean {
  return (
    action === 'COLLECTION_LETTER' ||
    action === 'LAWYER_LETTER' ||
    action === 'LITIGATION_LETTER'
  );
}

const baselineLabels: Record<string, string> = {
  SIGNING: '签约',
  INVOICE: '开票',
  PRE_ACCEPTANCE: '初验',
  FINAL_ACCEPTANCE: '终验',
  OTHER: '其他',
};

const entityLabels: Record<string, string> = {
  PROJECT: '项目',
  RECEIVABLE: '应收',
  RECEIPT: '回款',
  COLLECTION: '催缴',
  ATTACHMENT: '附件',
  RISK_RULE: '风险规则',
  IMPORT_BATCH: '导入批次',
};

const operationLabels: Record<string, string> = {
  CREATE: '新增',
  CONFIRM: '确认',
  UPDATE: '修改',
  UPLOAD: '上传',
  COMMIT: '提交',
  VOID_AND_CORRECT: '作废并更正',
};

function IdentityControls({
  data,
  onChange,
  compact = false,
}: {
  data: BootstrapData;
  onChange: (role: Role, districtCode?: string | null) => void;
  compact?: boolean;
}) {
  if (data.session.authMode === 'PASSWORD') {
    return (
      <AccountIdentity
        name={data.session.displayName}
        role={roleLabels[data.session.role]}
      />
    );
  }
  return (
    <>
      <span
        className={cn(
          'text-muted-foreground',
          compact ? 'text-[10px]' : 'pl-1 text-[11px]',
        )}
      >
        演示身份
      </span>
      <NativeSelect
        aria-label="切换演示角色"
        size="sm"
        className={compact ? 'min-w-[112px]' : 'min-w-[126px]'}
        value={data.session.role}
        onChange={(event) =>
          onChange(
            event.target.value as Role,
            event.target.value === 'CITY_ADMIN'
              ? null
              : (data.session.districtCode ?? 'BEILIN'),
          )
        }
      >
        {Object.entries(roleLabels).map(([role, label]) => (
          <NativeSelectOption key={role} value={role}>
            {label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {data.session.role !== 'CITY_ADMIN' ? (
        <NativeSelect
          aria-label="切换区县"
          size="sm"
          className={compact ? 'min-w-[84px]' : 'min-w-[92px]'}
          value={data.session.districtCode ?? 'BEILIN'}
          onChange={(event) => onChange(data.session.role, event.target.value)}
        >
          {data.districts.map((district) => (
            <NativeSelectOption key={district.id} value={district.code}>
              {district.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      ) : null}
    </>
  );
}

function describeError(error: unknown): string {
  if (error instanceof ApiClientError) {
    const details = Object.values(error.fieldErrors ?? {})
      .flat()
      .filter(Boolean)
      .slice(0, 3);
    return details.length
      ? `${error.message}：${Array.from(new Set(details)).join('；')}`
      : error.message;
  }
  return error instanceof Error ? error.message : '操作失败，请稍后重试';
}

function currentDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function centsForInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

interface UploadedAttachment {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

async function uploadAttachment(
  file: File,
  entityType: 'PROJECT' | 'RECEIPT' | 'COLLECTION',
  entityId: string,
): Promise<UploadedAttachment> {
  if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
    throw new ApiClientError('单个附件不能超过 10MB', 'FILE_TOO_LARGE');
  }
  if (
    !['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'].includes(
      file.type,
    )
  ) {
    throw new ApiClientError(
      '仅支持 PDF、JPG、PNG 格式',
      'UNSUPPORTED_FILE_TYPE',
    );
  }
  const body = new FormData();
  body.set('file', file);
  body.set('entityType', entityType);
  body.set('entityId', entityId);
  return apiRequest<UploadedAttachment>('/api/attachments', {
    method: 'POST',
    body,
  });
}

function AttachmentField({
  label,
  required,
  hint,
  onChange,
}: {
  label: string;
  required?: boolean;
  hint: string;
  onChange: (file: File | null) => void;
}) {
  return (
    <FormField label={label} required={required} hint={hint}>
      <Input
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        required={required}
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
    </FormField>
  );
}

function ApplicationHeader({
  data,
  refreshing,
  onRefresh,
  onChangeIdentity,
}: {
  data: BootstrapData;
  refreshing: boolean;
  onRefresh: () => void;
  onChangeIdentity: (role: Role, districtCode?: string | null) => void;
}) {
  return (
    <header className="app-topbar sticky top-0 z-20 flex h-[70px] items-center px-4 md:px-7">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-primary text-white shadow-sm lg:hidden">
          <CircleDollarSign className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-[-0.01em] text-[var(--app-text-strong)]">
            西安市项目应收管理系统
          </p>
          <p className="hidden text-xs text-muted-foreground sm:block">
            {data.session.districtName
              ? `${data.session.districtName}数据范围`
              : '全市数据范围'}{' '}
            · 持久化存储
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <fieldset
          disabled={refreshing}
          className="app-identity-cluster hidden md:flex"
        >
          <IdentityControls data={data} onChange={onChangeIdentity} />
        </fieldset>
        <Button
          variant="ghost"
          size="icon"
          aria-label="刷新数据"
          onClick={onRefresh}
          disabled={refreshing}
          aria-busy={refreshing}
        >
          <RefreshCw className={cn(refreshing && 'animate-spin')} />
        </Button>
        <div
          className="app-avatar size-8 text-xs font-semibold"
          aria-label={`当前身份：${roleLabels[data.session.role]}`}
        >
          {data.session.role === 'CITY_ADMIN'
            ? '市'
            : data.session.districtName?.slice(0, 1)}
        </div>
      </div>
    </header>
  );
}

export function ReceivablesApp() {
  const [data, setData] = React.useState<BootstrapData | null>(null);
  const [route, setRoute] = React.useState<WorkspaceRoute>({
    view: 'dashboard',
  });
  const view = route.view;
  const [contextProjectId, setContextProjectId] = React.useState<string | null>(
    null,
  );
  const [collectionInitialAction, setCollectionInitialAction] =
    React.useState<CollectionAction>('WECHAT');
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [notice, setNotice] = React.useState<Notice | null>(null);
  const [projectDialog, setProjectDialog] = React.useState(false);
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
  const [receivableStatus, setReceivableStatus] =
    React.useState<ReceivableFilter>('ALL');
  const [confirmingId, setConfirmingId] = React.useState<string | null>(null);
  const identitySwitch = React.useRef(false);

  function navigate(next: View) {
    setRoute({ view: next });
    window.location.hash = next;
  }
  function openProject(
    projectId: string,
    section: ProjectSection = 'overview',
    receivableId?: string,
  ) {
    const hash = projectHash(projectId, section, receivableId);
    setRoute(parseWorkspaceHash(hash));
    window.location.hash = hash;
  }
  function openNode(id: string) {
    const node = data?.receivables.find((item) => item.id === id);
    if (node) openProject(node.projectId, 'receivables', id);
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

  React.useEffect(() => {
    const restoreView = () => {
      const next = window.location.hash.slice(1);
      if (next === 'main-content') return;
      setRoute(parseWorkspaceHash(next));
    };
    restoreView();
    window.addEventListener('hashchange', restoreView);
    return () => window.removeEventListener('hashchange', restoreView);
  }, []);

  React.useEffect(() => {
    document.title = `${VIEW_TITLES[view]} · 项目应收管理系统`;
  }, [view]);

  const load = React.useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    try {
      const next = await apiRequest<BootstrapData>('/api/bootstrap');
      setData(next);
    } catch (error) {
      setNotice({
        type: 'error',
        title: '数据加载失败',
        message:
          error instanceof Error ? error.message : '无法读取本地业务数据',
      });
    } finally {
      if (background) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let active = true;

    void apiRequest<BootstrapData>('/api/bootstrap')
      .then((next) => {
        if (active) setData(next);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setNotice({
          type: 'error',
          title: '数据加载失败',
          message:
            error instanceof Error ? error.message : '无法读取本地业务数据',
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const done = React.useCallback(
    async (message: string) => {
      setNotice({ type: 'success', title: '操作成功', message });
      await load(true);
    },
    [load],
  );

  async function changeIdentity(role: Role, districtCode?: string | null) {
    if (identitySwitch.current) return;
    identitySwitch.current = true;
    setRefreshing(true);
    setProjectDialog(false);
    setNodeDialog(false);
    setReceiptDialog(false);
    setCollectionDialog(false);
    setReceiptCorrection(null);
    setCollectionCorrection(null);
    setContextProjectId(null);
    setOperationTarget(null);
    try {
      await apiRequest('/api/session', {
        method: 'POST',
        body: JSON.stringify({ role, districtCode }),
      });
      setNotice({
        type: 'success',
        title: '身份已切换',
        message:
          role === 'CITY_ADMIN'
            ? '当前可查看全部区县数据'
            : `当前仅可处理${districtCode ?? ''}对应区县数据`,
      });
      await load(true);
      navigate('dashboard');
    } catch (error) {
      setNotice({
        type: 'error',
        title: '身份切换失败',
        message: error instanceof Error ? error.message : '请稍后重试',
      });
    } finally {
      identitySwitch.current = false;
      setRefreshing(false);
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
      await apiRequest('/api/receivables/confirm', {
        method: 'POST',
        body: JSON.stringify({ id }),
      });
      await done('应收已确认，项目状态已更新，现在可以登记回款');
    } catch (error) {
      setNotice({
        type: 'error',
        title: '确认失败',
        message: error instanceof Error ? error.message : '请稍后重试',
      });
    } finally {
      setConfirmingId(null);
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
            {notice?.message || '请检查网络连接后重试，已有数据不会被清除。'}
          </p>
          <Button onClick={() => void load()}>
            <RefreshCw />
            重新加载
          </Button>
        </section>
      </main>
    );
  }

  if (loading || !data) {
    return (
      <div className="app-loading-screen">
        <output
          className="app-loading-panel"
          aria-live="polite"
          aria-label="正在载入应收台账"
        >
          <LoaderCircle
            aria-hidden="true"
            className="size-5 animate-spin text-[var(--app-brand)]"
          />
          <div>
            <p className="text-sm font-medium text-[var(--app-text-strong)]">
              正在载入应收台账
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              正在安全读取你的业务数据
            </p>
          </div>
        </output>
      </div>
    );
  }

  const content = route.projectId ? (
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
  ) : (
    {
      dashboard: (
        <BusinessCockpit
          data={data}
          models={models}
          today={today}
          onOpen={openProject}
          onNew={() => setProjectDialog(true)}
          onProjects={() => navigate('projects')}
        />
      ),
      projects: (
        <ProjectDirectory
          key="active"
          data={data}
          models={models}
          onOpen={openProject}
          onNew={() => setProjectDialog(true)}
        />
      ),
      history: (
        <ProjectDirectory
          key="history"
          data={data}
          models={models}
          archived
          onOpen={openProject}
          onNew={() => setProjectDialog(true)}
        />
      ),
      receivables: (
        <ReceivablesView
          data={data}
          status={receivableStatus}
          onStatusChange={setReceivableStatus}
          onSelect={openNode}
          confirmingId={confirmingId}
          onConfirm={(id) => void confirmReceivable(id)}
          onNewNode={() => openOperation('node', null)}
        />
      ),
      receipts: (
        <ReceiptsView
          data={data}
          onNew={() => openOperation('receipt', null)}
          onCorrect={setReceiptCorrection}
        />
      ),
      collections: (
        <CollectionsView
          data={data}
          onNew={() => openOperation('collection', null)}
          onCorrect={setCollectionCorrection}
        />
      ),
      imports: <ImportView data={data} onDone={done} />,
      audit: <AuditView data={data} />,
      risk: <RiskView data={data} onDone={done} />,
      'risk-analysis': <GlobalRiskView models={models} onOpen={openProject} />,
      account: <AccountScopeView data={data} />,
    }[view]
  );

  return (
    <div
      className="app-shell"
      key={`${data.session.role}:${data.session.districtId}`}
    >
      <a className="app-skip-link" href="#main-content">
        跳转到主要内容
      </a>
      <WorkspaceNavigation view={view} onNavigate={navigate} />

      <div className="lg:pl-[232px]">
        <ApplicationHeader
          data={data}
          refreshing={refreshing}
          onRefresh={() => void load(true)}
          onChangeIdentity={(role, districtCode) =>
            void changeIdentity(role, districtCode)
          }
        />
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
        {!route.projectId && (
          <WorkspaceSubnav view={view} onNavigate={navigate} />
        )}

        <main
          id="main-content"
          tabIndex={-1}
          className="app-main lc-main"
          aria-busy={refreshing}
        >
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
          <div key={route.projectId ?? view}>{content}</div>
        </main>
      </div>

      <ProjectDialog
        key={projectDialog ? 'project-open' : 'project-closed'}
        open={projectDialog}
        data={data}
        onOpenChange={setProjectDialog}
        onDone={done}
        onCreated={(id) => openProject(id, 'receivables')}
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

function ReceivableTable({
  rows,
  compact,
  onConfirm,
  confirmingId,
  onSelect,
}: {
  rows: ReceivableRecord[];
  compact?: boolean;
  onConfirm?: (id: string) => void;
  confirmingId?: string | null;
  onSelect?: (id: string) => void;
}) {
  return (
    <Table aria-label={compact ? '高风险应收事项' : '应收明细'}>
      <TableHeader>
        <TableRow className="app-table-head-row">
          <TableHead className="pl-5">应收编号 / 项目</TableHead>
          <TableHead>区县</TableHead>
          <TableHead>款项</TableHead>
          <TableHead className="text-right">应收 / 已收</TableHead>
          <TableHead>付款日</TableHead>
          <TableHead>风险</TableHead>
          {!compact ? <TableHead>法律风险</TableHead> : null}
          <TableHead>核销</TableHead>
          {!compact ? <TableHead className="pr-5">操作</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="py-3 pl-5">
              {onSelect ? (
                <button
                  type="button"
                  className="app-data-title app-table-link"
                  onClick={() => onSelect(item.id)}
                  aria-label={`查看${item.projectName} ${item.receivableCode}详情`}
                >
                  {item.projectName}
                </button>
              ) : (
                <p className="app-data-title">{item.projectName}</p>
              )}
              <p className="app-data-code">{item.receivableCode}</p>
            </TableCell>
            <TableCell className="text-xs">{item.districtName}</TableCell>
            <TableCell className="text-xs">{item.paymentType}</TableCell>
            <TableCell className="text-right">
              <p className="text-xs font-semibold">
                {formatYuan(item.amountCents)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                已收 {formatYuan(item.receivedAmountCents)}
              </p>
            </TableCell>
            <TableCell className="text-xs">{item.dueDate}</TableCell>
            <TableCell>
              <RiskBadge item={item} />
            </TableCell>
            {!compact ? (
              <TableCell>
                {item.legalRiskLevel ? (
                  <Badge variant="outline">{item.legalRiskLevel}级</Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
            ) : null}
            <TableCell>
              <WriteoffBadge status={item.writeoffStatus} />
            </TableCell>
            {!compact ? (
              <TableCell className="pr-5">
                {item.confirmationStatus === 'DRAFT' && onConfirm ? (
                  <Button
                    size="sm"
                    disabled={Boolean(confirmingId)}
                    aria-busy={confirmingId === item.id}
                    onClick={() => onConfirm(item.id)}
                  >
                    {confirmingId === item.id ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Check />
                    )}{' '}
                    确认
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {item.latestCollectionDate
                      ? `${item.latestCollectionDate.slice(5)} ${
                          actionLabels[item.latestCollectionAction!]
                        }`
                      : '—'}
                  </span>
                )}
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ReceivablesView({
  data,
  onConfirm,
  onNewNode,
  status,
  onStatusChange,
  onSelect,
  confirmingId,
}: {
  data: BootstrapData;
  onConfirm: (id: string) => void;
  onNewNode: () => void;
  status: ReceivableFilter;
  onStatusChange: (status: ReceivableFilter) => void;
  onSelect: (id: string) => void;
  confirmingId: string | null;
}) {
  const [query, setQuery] = React.useState('');
  const [districtId, setDistrictId] = React.useState('');
  const rows = filterReceivables(data.receivables, {
    query,
    status,
    districtId,
  });
  const balance = rows.reduce((sum, row) => sum + row.remainingAmountCents, 0);

  function downloadRows() {
    const url = URL.createObjectURL(
      new Blob([receivablesCsv(rows)], { type: 'text/csv;charset=utf-8;' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `应收台账-${RECEIVABLE_FILTERS[status]}-${currentDate()}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <PageHeading
        eyebrow="应收管理"
        title="应收节点与风险"
        description="待确认应收不能登记回款；风险和核销状态由系统自动计算。"
        actions={
          data.session.role !== 'DISTRICT_OPERATOR' ? (
            <Button onClick={onNewNode}>
              <Plus /> 新增付款节点
            </Button>
          ) : null
        }
      />
      <DataPanel
        title="应收明细"
        description={`共 ${rows.length} 笔 · 筛选余额 ${formatYuan(balance)}（含待确认）`}
        actions={
          <>
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder="应收编号 / 项目 / 合同"
              label="搜索应收编号、项目或合同"
              className="w-[240px]"
            />
            <NativeSelect
              aria-label="按应收状态筛选"
              value={status}
              onChange={(e) =>
                onStatusChange(e.target.value as ReceivableFilter)
              }
            >
              {Object.entries(RECEIVABLE_FILTERS).map(([value, label]) => (
                <NativeSelectOption key={value} value={value}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {data.session.role === 'CITY_ADMIN' ? (
              <NativeSelect
                value={districtId}
                onChange={(e) => setDistrictId(e.target.value)}
                aria-label="按归属区县筛选"
              >
                <NativeSelectOption value="">全部区县</NativeSelectOption>
                {data.districts.map((district) => (
                  <NativeSelectOption key={district.id} value={district.id}>
                    {district.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              disabled={!rows.length}
              onClick={downloadRows}
            >
              <Download />
              导出台账
            </Button>
          </>
        }
      >
        {rows.length ? (
          <ReceivableTable
            rows={rows}
            onSelect={onSelect}
            confirmingId={confirmingId}
            onConfirm={
              data.session.role === 'CITY_ADMIN' ? onConfirm : undefined
            }
          />
        ) : (
          <EmptyState
            title="没有匹配的应收"
            description="请调整搜索词或筛选状态。"
          />
        )}
      </DataPanel>
    </>
  );
}

function ReceiptsView({
  data,
  onNew,
  onCorrect,
}: {
  data: BootstrapData;
  onNew: () => void;
  onCorrect: (record: ReceiptRecord) => void;
}) {
  const [status, setStatus] = React.useState('ALL');
  const rows = data.receipts.filter(
    (item) => status === 'ALL' || item.status === status,
  );
  const canCorrect = data.session.role !== 'DISTRICT_OPERATOR';
  return (
    <>
      <PageHeading
        eyebrow="回款流水"
        title="实际到账记录"
        description="一条应收可对应多笔实收；错误记录通过作废并追加更正保留证据。"
        actions={
          <Button onClick={onNew}>
            <Plus /> 登记回款
          </Button>
        }
      />
      <DataPanel
        title="回款流水"
        description={`共 ${rows.length} 条记录`}
        actions={
          <NativeSelect
            aria-label="按回款记录状态筛选"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <NativeSelectOption value="ALL">全部记录</NativeSelectOption>
            <NativeSelectOption value="VALID">有效</NativeSelectOption>
            <NativeSelectOption value="VOIDED">已作废</NativeSelectOption>
          </NativeSelect>
        }
      >
        <Table aria-label="回款流水记录">
          <TableHeader>
            <TableRow className="app-table-head-row">
              <TableHead className="pl-5">应收 / 项目</TableHead>
              <TableHead>区县</TableHead>
              <TableHead className="text-right">实收金额</TableHead>
              <TableHead>到账日期</TableHead>
              <TableHead>凭证</TableHead>
              <TableHead>录入信息</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="pr-5">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((record) => (
              <TableRow
                key={record.id}
                className={cn(record.status === 'VOIDED' && 'opacity-55')}
              >
                <TableCell className="pl-5">
                  <p className="text-xs font-medium">{record.projectName}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {record.receivableCode}
                  </p>
                </TableCell>
                <TableCell className="text-xs">{record.districtName}</TableCell>
                <TableCell className="text-right text-xs font-semibold">
                  {formatYuan(record.amountCents)}
                </TableCell>
                <TableCell className="text-xs">{record.receivedDate}</TableCell>
                <TableCell>
                  {record.attachmentId ? (
                    <a
                      href={`/api/attachments/${record.attachmentId}`}
                      className="app-inline-link"
                    >
                      <Paperclip className="size-3.5" />
                      {record.attachmentName}
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <p className="text-xs">{record.createdByName}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatDateTime(record.createdAt)}
                  </p>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      record.status === 'VALID' ? 'secondary' : 'outline'
                    }
                  >
                    {record.status === 'VALID' ? '有效' : '已作废'}
                  </Badge>
                  {record.voidReason ? (
                    <p className="mt-1 max-w-40 truncate text-[10px] text-[var(--app-negative)]">
                      {record.voidReason}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="pr-5">
                  {canCorrect && record.status === 'VALID' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onCorrect(record)}
                    >
                      <PencilLine /> 更正
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataPanel>
    </>
  );
}

function CollectionsView({
  data,
  onNew,
  onCorrect,
}: {
  data: BootstrapData;
  onNew: () => void;
  onCorrect: (record: CollectionRecord) => void;
}) {
  const canCorrect = data.session.role !== 'DISTRICT_OPERATOR';
  return (
    <>
      <PageHeading
        eyebrow="催缴中心"
        title="催缴时间线"
        description="所有动作只追加、不覆盖；正式函件必须上传留痕附件。"
        actions={
          <Button onClick={onNew}>
            <Plus /> 新增催缴
          </Button>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <DataPanel
          title="全部催缴记录"
          description={`共 ${data.collections.length} 条`}
          contentClassName="px-5"
        >
          <ol className="app-timeline" aria-label="催缴记录时间线">
            {data.collections.map((record) => (
              <li key={record.id} className="app-timeline-item">
                <div
                  aria-hidden="true"
                  className={cn(
                    'app-timeline-icon',
                    record.status === 'VOIDED' && 'is-voided',
                  )}
                >
                  <BellRing className="size-4" />
                </div>
                <div
                  className={cn(
                    'min-w-0 flex-1',
                    record.status === 'VOIDED' && 'opacity-55',
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-[var(--app-text-strong)]">
                      {actionLabels[record.actionType]}
                    </span>
                    <Badge variant="outline">{record.districtName}</Badge>
                    {record.status === 'VOIDED' ? (
                      <Badge variant="destructive">已作废</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-[var(--app-text)]">
                    {record.projectName} · {record.receivableCode}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {record.note || '未填写补充说明'}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                    <span>{record.actionDate}</span>
                    <span>{record.createdByName}</span>
                    {record.attachmentId ? (
                      <a
                        href={`/api/attachments/${record.attachmentId}`}
                        className="app-inline-link"
                      >
                        <Paperclip className="size-3" />
                        {record.attachmentName}
                      </a>
                    ) : null}
                    {record.voidReason ? (
                      <span className="text-[var(--app-negative)]">
                        作废原因：{record.voidReason}
                      </span>
                    ) : null}
                  </div>
                </div>
                {canCorrect && record.status === 'VALID' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onCorrect(record)}
                  >
                    更正
                  </Button>
                ) : null}
              </li>
            ))}
          </ol>
        </DataPanel>
        <Card className="app-panel h-fit gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">合规提示</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4 text-xs leading-5 text-muted-foreground">
            <div className="app-callout" data-tone="warning">
              催收函、律师函、诉讼函提交时必须上传 PDF、JPG 或 PNG。
            </div>
            <div className="app-callout" data-tone="info">
              法律风险以最近有效催缴日期计算；作废记录不会影响风险，但仍保留审计证据。
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function AuditView({ data }: { data: BootstrapData }) {
  const [query, setQuery] = React.useState('');
  const rows = data.auditLogs.filter((log) =>
    [
      log.entityId,
      log.actorName,
      log.reason,
      entityLabels[log.entityType],
      operationLabels[log.action],
      log.oldValue,
      log.newValue,
    ]
      .join(' ')
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow="审计日志"
        title="不可变更的操作记录"
        description={
          data.session.role === 'CITY_ADMIN'
            ? '当前可查看全市操作。'
            : `当前仅展示${data.session.districtName}操作。`
        }
      />
      <DataPanel
        title="操作流水"
        description={`匹配 ${rows.length} 条 · 展示权限范围内最近 300 条，完整日志持续保留`}
        actions={
          <SearchField
            value={query}
            onChange={setQuery}
            label="搜索操作人、记录编号或变更内容"
            placeholder="操作人 / 原因 / 变更内容"
            className="w-[280px]"
          />
        }
      >
        <Table aria-label="审计操作日志">
          <TableHeader>
            <TableRow className="app-table-head-row">
              <TableHead className="pl-5">时间</TableHead>
              <TableHead>区县</TableHead>
              <TableHead>实体</TableHead>
              <TableHead>操作</TableHead>
              <TableHead>字段</TableHead>
              <TableHead>原值 → 新值</TableHead>
              <TableHead>原因 / 来源</TableHead>
              <TableHead className="pr-5">操作人</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="pl-5 text-xs">
                  {formatDateTime(log.createdAt)}
                </TableCell>
                <TableCell className="text-xs">
                  {log.districtName || '市级'}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {entityLabels[log.entityType] || log.entityType}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs font-medium">
                  {operationLabels[log.action] || log.action}
                </TableCell>
                <TableCell className="text-xs">
                  {log.fieldName || '—'}
                </TableCell>
                <TableCell className="max-w-[260px]">
                  <details className="text-[11px]">
                    <summary className="cursor-pointer text-primary">
                      查看完整变更
                    </summary>
                    <dl className="mt-2 space-y-2 whitespace-pre-wrap break-all">
                      <dt className="text-muted-foreground">记录 ID</dt>
                      <dd>{log.entityId}</dd>
                      <dt className="text-muted-foreground">原值</dt>
                      <dd>{log.oldValue || '—'}</dd>
                      <dt className="text-muted-foreground">新值</dt>
                      <dd>{log.newValue || '—'}</dd>
                    </dl>
                  </details>
                </TableCell>
                <TableCell>
                  <p className="max-w-[180px] whitespace-normal break-words text-xs">
                    {log.reason || '—'}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {log.source}
                  </p>
                </TableCell>
                <TableCell className="pr-5">
                  <p className="text-xs">{log.actorName}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {roleLabels[log.actorRole]}
                  </p>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataPanel>
    </>
  );
}

function RiskView({
  data,
  onDone,
}: {
  data: BootstrapData;
  onDone: (message: string) => Promise<void>;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const rules = data.riskRules;
  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await apiRequest('/api/risk-rules', {
        method: 'PUT',
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      await onDone('风险阈值已更新，并写入审计日志');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="风险设置"
        title="逾期与法律风险阈值"
        description="修改规则会立即影响所有未结清应收，并永久记录修改原因。"
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,720px)_1fr]">
        <Card className="app-panel">
          <CardHeader>
            <CardTitle>规则参数</CardTitle>
            <CardDescription>
              {data.session.role === 'CITY_ADMIN'
                ? '市级管理员可调整'
                : '当前身份仅可查看'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-5">
              <fieldset className="app-form-section">
                <legend className="mb-3 text-sm font-medium">
                  逾期风险（天）
                </legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  <FormField label="蓝色起始">
                    <Input
                      name="blueMinDays"
                      type="number"
                      min={1}
                      defaultValue={rules.blueMinDays}
                      disabled={data.session.role !== 'CITY_ADMIN'}
                    />
                  </FormField>
                  <FormField label="黄色起始">
                    <Input
                      name="yellowMinDays"
                      type="number"
                      min={2}
                      defaultValue={rules.yellowMinDays}
                      disabled={data.session.role !== 'CITY_ADMIN'}
                    />
                  </FormField>
                  <FormField label="红色起始">
                    <Input
                      name="redMinDays"
                      type="number"
                      min={3}
                      defaultValue={rules.redMinDays}
                      disabled={data.session.role !== 'CITY_ADMIN'}
                    />
                  </FormField>
                </div>
              </fieldset>
              <fieldset className="app-form-section">
                <legend className="mb-3 text-sm font-medium">
                  法律风险起始（月）
                </legend>
                <div className="grid gap-3 sm:grid-cols-5">
                  {[
                    [
                      '五级',
                      'legalLevel5MinMonths',
                      rules.legalLevel5MinMonths,
                    ],
                    [
                      '四级',
                      'legalLevel4MinMonths',
                      rules.legalLevel4MinMonths,
                    ],
                    [
                      '三级',
                      'legalLevel3MinMonths',
                      rules.legalLevel3MinMonths,
                    ],
                    [
                      '二级',
                      'legalLevel2MinMonths',
                      rules.legalLevel2MinMonths,
                    ],
                    [
                      '一级',
                      'legalLevel1MinMonths',
                      rules.legalLevel1MinMonths,
                    ],
                  ].map(([label, name, value]) => (
                    <FormField key={String(name)} label={String(label)}>
                      <Input
                        name={String(name)}
                        type="number"
                        min={1}
                        defaultValue={Number(value)}
                        disabled={data.session.role !== 'CITY_ADMIN'}
                      />
                    </FormField>
                  ))}
                </div>
              </fieldset>
              {data.session.role === 'CITY_ADMIN' ? (
                <FormField label="修改原因" required>
                  <Textarea
                    name="reason"
                    required
                    placeholder="例如：根据最新省公司应收管理规则调整"
                  />
                </FormField>
              ) : null}
              <ErrorText error={error} />
              {data.session.role === 'CITY_ADMIN' ? (
                <Button type="submit" disabled={busy} aria-busy={busy}>
                  {busy ? <LoaderCircle className="animate-spin" /> : <Check />}
                  保存规则
                </Button>
              ) : null}
            </form>
          </CardContent>
        </Card>
        <Card className="app-panel h-fit">
          <CardHeader>
            <CardTitle>当前映射</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="app-callout" data-tone="info">
              蓝色：{rules.blueMinDays}–{rules.yellowMinDays - 1} 天
            </div>
            <div className="app-callout" data-tone="warning">
              黄色：{rules.yellowMinDays}–{rules.redMinDays - 1} 天
            </div>
            <div className="app-callout" data-tone="danger">
              红色：{rules.redMinDays} 天及以上
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              最近更新：{rules.updatedBy} · {formatDateTime(rules.updatedAt)}
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

interface ImportPreview {
  batchId: string;
  kind: ImportKind;
  fileName: string;
  totalRows: number;
  validRows: Array<Record<string, unknown>>;
  rowErrors: RowError[];
}

function ImportView({
  data,
  onDone,
}: {
  data: BootstrapData;
  onDone: (message: string) => Promise<void>;
}) {
  const [kind, setKind] = React.useState<ImportKind>('PROJECT');
  const [rows, setRows] = React.useState<Array<Record<string, unknown>>>([]);
  const [preview, setPreview] = React.useState<ImportPreview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const uploadInputId = React.useId();
  const templates = [
    {
      kind: 'PROJECT' as const,
      title: '项目主表',
      fields: '16 个项目、组织、客户和合同字段',
      file: '/templates/项目主表导入模板.xlsx',
      allowed: data.session.role === 'CITY_ADMIN',
    },
    {
      kind: 'RECEIVABLE' as const,
      title: '付款节点',
      fields: '8 个付款节点与账期字段',
      file: '/templates/付款节点导入模板.xlsx',
      allowed: data.session.role !== 'DISTRICT_OPERATOR',
    },
    {
      kind: 'RECEIPT' as const,
      title: '回款流水',
      fields: '应收编号、金额、日期和备注',
      file: '/templates/回款流水导入模板.xlsx',
      allowed: true,
    },
  ];

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setPreview(null);
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setError('请使用标准模板上传 .xlsx 文件');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Excel 文件不能超过 10MB，请拆分后导入');
      return;
    }
    setBusy(true);
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer(), {
        type: 'array',
        cellDates: true,
      });
      const sheet =
        workbook.Sheets['导入数据'] || workbook.Sheets[workbook.SheetNames[0]];
      const parsed = XLSX.utils
        .sheet_to_json<Record<string, unknown>>(sheet, {
          defval: '',
          raw: false,
          dateNF: 'yyyy-mm-dd',
        })
        .filter((row) =>
          Object.values(row).some((value) => String(value).trim() !== ''),
        );
      if (!parsed.length) throw new Error('模板中没有可导入数据');
      const result = await apiRequest<ImportPreview>('/api/imports/preview', {
        method: 'POST',
        body: JSON.stringify({ kind, fileName: file.name, rows: parsed }),
      });
      setRows(parsed);
      setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '文件解析失败');
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<{
        committedRows: number;
        rowErrors: RowError[];
      }>('/api/imports/commit', {
        method: 'POST',
        body: JSON.stringify({
          batchId: preview.batchId,
          kind,
          fileName: preview.fileName,
          rows,
        }),
      });
      setPreview(null);
      setRows([]);
      await onDone(
        `成功导入 ${result.committedRows} 行${
          result.rowErrors.length
            ? `，另有 ${result.rowErrors.length} 行未提交`
            : ''
        }`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败');
    } finally {
      setBusy(false);
    }
  }

  function downloadErrors() {
    if (!preview?.rowErrors.length) return;
    const quote = (value: string | number) =>
      `"${String(value).replaceAll('"', '""')}"`;
    const csv = [
      ['行号', '错误码', '错误说明', '相关字段'].map(quote).join(','),
      ...preview.rowErrors.map((item) =>
        [item.row, item.code, item.message, item.fields?.join('、') || '']
          .map(quote)
          .join(','),
      ),
    ].join('\r\n');
    const url = URL.createObjectURL(
      new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${preview.fileName.replace(/\.xlsx$/i, '')}-错误明细.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeading
        eyebrow="导入中心"
        title="模板下载与批量导入"
        description="上传后先预览并逐行校验；重复数据不会覆盖历史记录。"
      />
      <div className="grid gap-3 md:grid-cols-3">
        {templates.map((template) => (
          <Card
            key={template.kind}
            className="app-panel app-template-card"
            data-selected={kind === template.kind}
            data-disabled={!template.allowed}
          >
            <CardHeader>
              <div className="app-template-icon mb-2">
                <FileSpreadsheet className="size-5" />
              </div>
              <CardTitle>{template.title}</CardTitle>
              <CardDescription>{template.fields}</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button
                variant="outline"
                nativeButton={false}
                render={
                  <a
                    href={template.file}
                    download
                    aria-label={`下载${template.title}导入模板`}
                  >
                    <Download /> 下载
                  </a>
                }
              />
              <Button
                variant={kind === template.kind ? 'default' : 'secondary'}
                disabled={!template.allowed}
                aria-pressed={kind === template.kind}
                onClick={() => {
                  setKind(template.kind);
                  setPreview(null);
                  setRows([]);
                  setError(null);
                }}
              >
                {template.allowed ? '选择导入' : '当前身份不可导入'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <DataPanel
        className="mt-4"
        title="上传并预览"
        description={`当前类型：${templates.find((item) => item.kind === kind)?.title}`}
        contentClassName="space-y-4 px-5 py-5"
      >
        <label
          htmlFor={uploadInputId}
          className="app-upload-zone"
          data-busy={busy}
        >
          {busy ? (
            <LoaderCircle className="mb-2 size-6 animate-spin text-[var(--app-brand)]" />
          ) : (
            <UploadCloud className="mb-2 size-7 text-[var(--app-brand)]" />
          )}
          <span className="text-sm font-medium text-[var(--app-text-strong)]">
            选择填写完成的 .xlsx 文件
          </span>
          <span className="mt-1 text-xs text-muted-foreground">
            单次最多 1000 行
          </span>
          <input
            id={uploadInputId}
            type="file"
            accept=".xlsx"
            className="sr-only"
            disabled={busy}
            onChange={(event) => void chooseFile(event.target.files?.[0])}
          />
        </label>
        <ErrorText error={error} />
        {preview ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryTile label="总行数" value={preview.totalRows} />
              <SummaryTile
                label="有效行"
                value={preview.validRows.length}
                tone="success"
              />
              <SummaryTile
                label="错误行"
                value={preview.rowErrors.length}
                tone="danger"
              />
            </div>
            {preview.rowErrors.length ? (
              <div className="max-h-56 overflow-auto rounded-lg border">
                <Table aria-label="导入错误明细">
                  <TableHeader>
                    <TableRow className="app-table-head-row">
                      <TableHead>行号</TableHead>
                      <TableHead>错误</TableHead>
                      <TableHead>字段</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rowErrors.map((item) => (
                      <TableRow key={`${item.row}-${item.code}`}>
                        <TableCell>{item.row}</TableCell>
                        <TableCell className="text-[var(--app-negative)]">
                          {item.message}
                        </TableCell>
                        <TableCell>{item.fields?.join('、') || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void commit()}
                disabled={busy || preview.validRows.length === 0}
                aria-busy={busy}
              >
                {busy ? <LoaderCircle className="animate-spin" /> : <Check />}
                提交 {preview.validRows.length} 行有效数据
              </Button>
              {preview.rowErrors.length ? (
                <Button variant="outline" onClick={downloadErrors}>
                  <Download /> 下载错误明细
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </DataPanel>
    </>
  );
}

function ProjectDialog({
  open,
  data,
  onOpenChange,
  onDone,
  onCreated,
}: {
  open: boolean;
  data: BootstrapData;
  onOpenChange: (open: boolean) => void;
  onDone: (message: string) => Promise<void>;
  onCreated?: (id: string) => void;
}) {
  const [tags, setTags] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<{ id: string; projectCode: string }>(
        '/api/projects',
        {
          method: 'POST',
          body: JSON.stringify({
            ...Object.fromEntries(form.entries()),
            tags,
          }),
        },
      );
      onOpenChange(false);
      await onDone(`项目 ${result.projectCode} 已创建`);
      onCreated?.(result.id);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  const tagOptions = ['数智签约', '信产签约', '权责项目', '确认欠费'];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>新建项目</DialogTitle>
          <DialogDescription>
            项目编码由系统自动生成，合同编码必须保持唯一。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="项目名称" required>
              <Input name="name" required placeholder="请输入项目全称" />
            </FormField>
            <FormField label="合同编码" required>
              <Input
                name="contractCode"
                required
                placeholder="例如 HT-2026-001"
              />
            </FormField>
            <FormField label="归属单位（三级）" required>
              <NativeSelect name="districtCode" className="w-full" required>
                {data.districts.map((district) => (
                  <NativeSelectOption key={district.id} value={district.code}>
                    {district.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="归属单位（四级）" required>
              <Input
                name="orgLevel4"
                required
                placeholder="例如 碑林政企客户团队"
              />
            </FormField>
            <FormField label="客户名称" required>
              <Input name="customerName" required />
            </FormField>
            <FormField label="客户类型" required>
              <NativeSelect name="customerType" className="w-full" required>
                {['政府', '企业', '中小微'].map((item) => (
                  <NativeSelectOption key={item} value={item}>
                    {item}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="客户对接人" required>
              <Input name="customerContact" required />
            </FormField>
            <FormField label="项目交付负责人" required>
              <Input name="deliveryOwner" required />
            </FormField>
            <FormField label="客户经理" required>
              <Input name="accountManager" required />
            </FormField>
            <FormField label="交付经理" required>
              <Input name="deliveryManager" required />
            </FormField>
            <FormField label="项目状态" required>
              <NativeSelect name="status" className="w-full" required>
                {['执行中', '验收中', '维保期', '已关闭'].map((item) => (
                  <NativeSelectOption key={item} value={item}>
                    {item}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="合同签订日期" required>
              <Input name="contractDate" type="date" required />
            </FormField>
            <FormField label="合同总金额（元）" required>
              <Input
                name="contractAmountYuan"
                type="number"
                min="0.01"
                step="0.01"
                required
                placeholder="0.00"
              />
            </FormField>
            <FormField label="合同金额构成" required>
              <NativeSelect
                name="amountComposition"
                className="w-full"
                required
              >
                {['标品', 'ICT（税率6%）', 'ICT（税率13%）'].map((item) => (
                  <NativeSelectOption key={item} value={item}>
                    {item}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="付费编码">
              <Input name="billingCode" placeholder="可选" />
            </FormField>
            <FormField label="项目属性打标" className="md:col-span-2">
              <div className="app-selection-box">
                {tagOptions.map((tag) => (
                  <label
                    key={tag}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={tags.includes(tag)}
                      onCheckedChange={(checked) =>
                        setTags((current) =>
                          checked
                            ? Array.from(new Set([...current, tag]))
                            : current.filter((item) => item !== tag),
                        )
                      }
                    />
                    {tag}
                  </label>
                ))}
              </div>
            </FormField>
          </div>
          <ErrorText error={error} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={busy} aria-busy={busy}>
              {busy ? <LoaderCircle className="animate-spin" /> : <Plus />}
              创建项目
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NodeDialog({
  open,
  data,
  contextProjectId,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  data: BootstrapData;
  contextProjectId?: string | null;
  onOpenChange: (open: boolean) => void;
  onDone: (message: string) => Promise<void>;
}) {
  const projects = React.useMemo(
    () =>
      data.projects.filter((project) =>
        contextProjectId
          ? project.id === contextProjectId
          : !project.archivedAt,
      ),
    [data.projects, contextProjectId],
  );
  const [projectId, setProjectId] = React.useState(() => projects[0]?.id ?? '');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !projects.some((p) => p.id === projectId)) {
      setError('当前项目已不可用，请关闭面板并刷新项目。');
      return;
    }
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<{
        id: string;
        receivableCode: string;
        dueDate: string;
      }>('/api/receivables', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      onOpenChange(false);
      await onDone(
        `付款节点 ${result.receivableCode} 已生成，约定付款日 ${result.dueDate}`,
      );
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="lc-operation-sheet">
        <DialogHeader>
          <DialogTitle>新增付款节点</DialogTitle>
          <DialogDescription>
            保存后生成待确认应收，约定付款日按基准日期加账期天数计算。
          </DialogDescription>
        </DialogHeader>
        {projects.length ? (
          <form onSubmit={submit} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="项目" required className="md:col-span-2">
                <NativeSelect
                  name="projectId"
                  className="w-full"
                  required
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                >
                  {projects.map((project) => (
                    <NativeSelectOption key={project.id} value={project.id}>
                      {project.projectCode} · {project.name} ·{' '}
                      {project.districtName}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField label="节点序号" required>
                <Input
                  name="sequenceNo"
                  type="number"
                  min={1}
                  step={1}
                  required
                />
              </FormField>
              <FormField label="款项类型" required>
                <NativeSelect name="paymentType" className="w-full" required>
                  {['预付款', '进度款', '初验款', '终验款', '质保金'].map(
                    (item) => (
                      <NativeSelectOption key={item} value={item}>
                        {item}
                      </NativeSelectOption>
                    ),
                  )}
                </NativeSelect>
              </FormField>
              <FormField label="节点金额（元）" required>
                <Input
                  name="amountYuan"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                />
              </FormField>
              <FormField label="付款条件" required>
                <Input
                  name="paymentCondition"
                  required
                  placeholder="例如 初验完成后30日内"
                />
              </FormField>
              <FormField label="基准事件" required>
                <NativeSelect name="baselineEvent" className="w-full" required>
                  {Object.entries(baselineLabels).map(([value, label]) => (
                    <NativeSelectOption key={value} value={value}>
                      {label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField label="基准日期" required>
                <Input name="baselineDate" type="date" required />
              </FormField>
              <FormField label="账期天数" required>
                <Input
                  name="termDays"
                  type="number"
                  min={0}
                  max={3650}
                  step={1}
                  required
                />
              </FormField>
              <FormField label="验收类型">
                <Input name="acceptanceType" placeholder="可选，如 初验" />
              </FormField>
              <FormField label="验收日期">
                <Input name="acceptanceDate" type="date" />
              </FormField>
              <FormField label="发票状态">
                <Input name="invoiceStatus" placeholder="可选，如 已开票" />
              </FormField>
              <FormField label="发票递交日期">
                <Input name="invoiceDeliveredDate" type="date" />
              </FormField>
              <FormField label="逾期原因" className="md:col-span-2">
                <Textarea
                  name="overdueReason"
                  placeholder="可选；如已知风险原因可提前记录"
                />
              </FormField>
            </div>
            <ErrorText error={error} />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={busy || !projectId}
                aria-busy={busy}
              >
                {busy ? <LoaderCircle className="animate-spin" /> : <Plus />}
                生成待确认应收
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <>
            <EmptyState
              title="暂无可维护项目"
              description="请先创建进行中的项目。"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                关闭
              </Button>
            </DialogFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ReceiptDialog({
  open,
  data,
  contextProjectId,
  initialReceivableId,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  data: BootstrapData;
  contextProjectId?: string | null;
  initialReceivableId?: string | null;
  onOpenChange: (open: boolean) => void;
  onDone: (message: string) => Promise<void>;
}) {
  const candidates = React.useMemo(
    () =>
      contextualCandidates(
        data.receivables,
        contextProjectId,
        initialReceivableId,
      ).filter(
        (item) =>
          item.confirmationStatus === 'CONFIRMED' &&
          item.remainingAmountCents > 0,
      ),
    [data.receivables, contextProjectId, initialReceivableId],
  );
  const [receivableId, setReceivableId] = React.useState(
    () =>
      candidates.find((item) => item.id === initialReceivableId)?.id ??
      candidates[0]?.id ??
      '',
  );
  const [file, setFile] = React.useState<File | null>(null);
  const [uploaded, setUploaded] = React.useState<UploadedAttachment | null>(
    null,
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const selected = candidates.find((item) => item.id === receivableId);
  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !candidates.some((r) => r.id === receivableId)) {
      setError(
        '当前应收已结清或不再可用；不会改选其他节点，请关闭面板后刷新。',
      );
      return;
    }
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      let attachment = uploaded;
      if (file && !attachment) {
        attachment = await uploadAttachment(file, 'RECEIPT', receivableId);
        setUploaded(attachment);
      }
      await apiRequest('/api/receipts', {
        method: 'POST',
        body: JSON.stringify({
          receivableId,
          amountYuan: form.get('amountYuan'),
          receivedDate: form.get('receivedDate'),
          note: form.get('note'),
          attachmentId: attachment?.id ?? null,
        }),
      });
      onOpenChange(false);
      await onDone('回款已登记，核销状态和项目归档状态已重新计算');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="lc-operation-sheet">
        <DialogHeader>
          <DialogTitle>登记回款</DialogTitle>
          <DialogDescription>
            仅可选择已确认且仍有余额的应收，系统会阻止超额回款。
          </DialogDescription>
        </DialogHeader>
        {candidates.length ? (
          <form onSubmit={submit} className="space-y-4">
            <FormField label="应收记录" required>
              <NativeSelect
                className="w-full"
                value={receivableId}
                onChange={(event) => {
                  setReceivableId(event.target.value);
                  setFile(null);
                  setUploaded(null);
                }}
              >
                {candidates.map((item) => (
                  <NativeSelectOption key={item.id} value={item.id}>
                    {item.receivableCode} · {item.projectName} · 余额{' '}
                    {formatYuan(item.remainingAmountCents)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </FormField>
            {selected ? (
              <div className="grid grid-cols-3 gap-2">
                <SummaryTile
                  label="应收"
                  value={formatYuan(selected.amountCents)}
                />
                <SummaryTile
                  label="已收"
                  value={formatYuan(selected.receivedAmountCents)}
                />
                <SummaryTile
                  label="剩余"
                  value={formatYuan(selected.remainingAmountCents)}
                  tone="brand"
                />
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="实收金额（元）" required>
                <Input
                  name="amountYuan"
                  type="number"
                  min="0.01"
                  max={
                    selected
                      ? centsForInput(selected.remainingAmountCents)
                      : undefined
                  }
                  step="0.01"
                  required
                />
              </FormField>
              <FormField label="实收日期" required>
                <Input
                  name="receivedDate"
                  type="date"
                  defaultValue={currentDate()}
                  required
                />
              </FormField>
            </div>
            <FormField label="备注">
              <Textarea name="note" placeholder="可填写银行流水、到账说明等" />
            </FormField>
            <AttachmentField
              label="回款凭证"
              hint="可选；支持 PDF、JPG、PNG，单文件不超过 10MB。"
              onChange={(next) => {
                setFile(next);
                setUploaded(null);
              }}
            />
            {uploaded ? (
              <output className="text-xs text-[var(--app-positive)]">
                已上传：{uploaded.fileName}
              </output>
            ) : null}
            <ErrorText error={error} />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={busy || !receivableId}
                aria-busy={busy}
              >
                {busy ? <LoaderCircle className="animate-spin" /> : <Check />}
                保存回款
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <>
            <EmptyState
              title="暂无可登记应收"
              description="待确认应收需由市级管理员确认后才能登记回款。"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                关闭
              </Button>
            </DialogFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ReceiptCorrectionDialog({
  record,
  data,
  onOpenChange,
  onDone,
}: {
  record: ReceiptRecord | null;
  data: BootstrapData;
  onOpenChange: (open: boolean) => void;
  onDone: (message: string) => Promise<void>;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [uploaded, setUploaded] = React.useState<UploadedAttachment | null>(
    null,
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!record) return null;
  const currentRecord = record;
  const receivable = data.receivables.find(
    (item) => item.id === currentRecord.receivableId,
  );

  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || currentRecord.status !== 'VALID') {
      setError('原记录已作废或当前不可更正，请刷新后查看。');
      return;
    }
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      let attachment = uploaded;
      if (file && !attachment) {
        attachment = await uploadAttachment(
          file,
          'RECEIPT',
          currentRecord.receivableId,
        );
        setUploaded(attachment);
      }
      await apiRequest('/api/receipts/correct', {
        method: 'POST',
        body: JSON.stringify({
          originalId: currentRecord.id,
          receivableId: currentRecord.receivableId,
          amountYuan: form.get('amountYuan'),
          receivedDate: form.get('receivedDate'),
          note: form.get('note'),
          reason: form.get('reason'),
          attachmentId: attachment?.id ?? currentRecord.attachmentId ?? null,
        }),
      });
      onOpenChange(false);
      await onDone('原回款已作废，更正记录已追加并重新计算核销状态');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  const maxCents = (receivable?.remainingAmountCents ?? 0) + record.amountCents;
  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent className="lc-operation-sheet">
        <DialogHeader>
          <DialogTitle>作废并更正回款</DialogTitle>
          <DialogDescription>
            原记录不会删除，将标记作废并追加一条新的有效记录。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="app-record-context">
            <p className="font-medium text-[var(--app-text-strong)]">
              {record.projectName}
            </p>
            <p className="mt-1 text-muted-foreground">
              {record.receivableCode} · 原金额 {formatYuan(record.amountCents)}{' '}
              · {record.receivedDate}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="更正后金额（元）" required>
              <Input
                name="amountYuan"
                type="number"
                min="0.01"
                max={centsForInput(maxCents)}
                step="0.01"
                defaultValue={centsForInput(record.amountCents)}
                required
              />
            </FormField>
            <FormField label="更正后实收日期" required>
              <Input
                name="receivedDate"
                type="date"
                defaultValue={record.receivedDate}
                required
              />
            </FormField>
          </div>
          <FormField label="更正后备注">
            <Textarea name="note" defaultValue={record.note ?? ''} />
          </FormField>
          <AttachmentField
            label="替换凭证"
            hint={
              record.attachmentName
                ? `不选择新文件将沿用：${record.attachmentName}`
                : '可选；支持 PDF、JPG、PNG。'
            }
            onChange={(next) => {
              setFile(next);
              setUploaded(null);
            }}
          />
          <FormField
            label="更正原因"
            required
            hint="原因会进入审计日志，且不可删除。"
          >
            <Textarea
              name="reason"
              required
              placeholder="请说明原记录错误及更正依据"
            />
          </FormField>
          <ErrorText error={error} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={busy} aria-busy={busy}>
              {busy ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <PencilLine />
              )}
              作废并保存更正
            </Button>
          </DialogFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function CollectionDialog({
  open,
  data,
  contextProjectId,
  initialReceivableId,
  initialAction = 'WECHAT',
  onOpenChange,
  onDone,
}: {
  open: boolean;
  data: BootstrapData;
  contextProjectId?: string | null;
  initialReceivableId?: string | null;
  initialAction?: CollectionAction;
  onOpenChange: (open: boolean) => void;
  onDone: (message: string) => Promise<void>;
}) {
  const candidates = React.useMemo(
    () =>
      contextualCandidates(
        data.receivables,
        contextProjectId,
        initialReceivableId,
      ).filter(
        (item) =>
          item.confirmationStatus === 'CONFIRMED' &&
          item.writeoffStatus !== 'PAID',
      ),
    [data.receivables, contextProjectId, initialReceivableId],
  );
  const [receivableId, setReceivableId] = React.useState(
    () =>
      candidates.find((item) => item.id === initialReceivableId)?.id ??
      candidates[0]?.id ??
      '',
  );
  const [action, setAction] = React.useState<CollectionAction>(initialAction);
  const [file, setFile] = React.useState<File | null>(null);
  const [uploaded, setUploaded] = React.useState<UploadedAttachment | null>(
    null,
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const formal = requiresCollectionAttachment(action);
  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !candidates.some((r) => r.id === receivableId)) {
      setError(
        '当前应收已结清或不再可用；不会改选其他节点，请关闭面板后刷新。',
      );
      return;
    }
    const form = new FormData(event.currentTarget);
    if (formal && !file && !uploaded) {
      setError('正式函件必须上传 PDF、JPG 或 PNG 附件');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let attachment = uploaded;
      if (file && !attachment) {
        attachment = await uploadAttachment(file, 'COLLECTION', receivableId);
        setUploaded(attachment);
      }
      await apiRequest('/api/collections', {
        method: 'POST',
        body: JSON.stringify({
          receivableId,
          actionType: action,
          actionDate: form.get('actionDate'),
          note: form.get('note'),
          attachmentId: attachment?.id ?? null,
        }),
      });
      onOpenChange(false);
      await onDone('催缴动作已追加，法律风险基准已重新计算');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="lc-operation-sheet">
        <DialogHeader>
          <DialogTitle>新增催缴动作</DialogTitle>
          <DialogDescription>
            催缴时间线只追加、不覆盖；正式函件必须上传附件。
          </DialogDescription>
        </DialogHeader>
        {candidates.length ? (
          <form onSubmit={submit} className="space-y-4">
            <FormField label="应收记录" required>
              <NativeSelect
                className="w-full"
                value={receivableId}
                onChange={(event) => {
                  setReceivableId(event.target.value);
                  setFile(null);
                  setUploaded(null);
                }}
              >
                {candidates.map((item) => (
                  <NativeSelectOption key={item.id} value={item.id}>
                    {item.receivableCode} · {item.projectName} · 余额{' '}
                    {formatYuan(item.remainingAmountCents)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="催缴动作" required>
                <NativeSelect
                  className="w-full"
                  value={action}
                  onChange={(event) => {
                    setAction(event.target.value as CollectionAction);
                    setFile(null);
                    setUploaded(null);
                  }}
                >
                  {Object.entries(actionLabels).map(([value, label]) => (
                    <NativeSelectOption key={value} value={value}>
                      {label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField label="催缴日期" required>
                <Input
                  name="actionDate"
                  type="date"
                  defaultValue={currentDate()}
                  required
                />
              </FormField>
            </div>
            <FormField label="沟通纪要">
              <Textarea
                name="note"
                placeholder="记录沟通对象、反馈、承诺日期和下一步安排"
              />
            </FormField>
            <AttachmentField
              label="催缴附件"
              required={formal}
              hint={
                formal
                  ? '当前动作属于正式函件，附件必传。'
                  : '微信、面谈等动作可选传附件。'
              }
              onChange={(next) => {
                setFile(next);
                setUploaded(null);
              }}
            />
            <ErrorText error={error} />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={busy || !receivableId}
                aria-busy={busy}
              >
                {busy ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <BellRing />
                )}
                保存催缴
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <>
            <EmptyState
              title="暂无可催缴应收"
              description="只有已确认且未结清的应收可新增催缴动作。"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                关闭
              </Button>
            </DialogFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CollectionCorrectionDialog({
  record,
  data,
  onOpenChange,
  onDone,
}: {
  record: CollectionRecord | null;
  data: BootstrapData;
  onOpenChange: (open: boolean) => void;
  onDone: (message: string) => Promise<void>;
}) {
  const [action, setAction] = React.useState<CollectionAction>(
    () => record?.actionType ?? 'WECHAT',
  );
  const [file, setFile] = React.useState<File | null>(null);
  const [uploaded, setUploaded] = React.useState<UploadedAttachment | null>(
    null,
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!record) return null;
  const currentRecord = record;
  const formal = requiresCollectionAttachment(action);
  const existingAttachment = data.attachments.find(
    (item) => item.id === currentRecord.attachmentId,
  );

  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || currentRecord.status !== 'VALID') {
      setError('原记录已作废或当前不可更正，请刷新后查看。');
      return;
    }
    const form = new FormData(event.currentTarget);
    const inheritedAttachmentId = currentRecord.attachmentId ?? null;
    if (formal && !file && !uploaded && !inheritedAttachmentId) {
      setError('正式函件更正记录必须上传附件');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let attachment = uploaded;
      if (file && !attachment) {
        attachment = await uploadAttachment(
          file,
          'COLLECTION',
          currentRecord.receivableId,
        );
        setUploaded(attachment);
      }
      await apiRequest('/api/collections/correct', {
        method: 'POST',
        body: JSON.stringify({
          originalId: currentRecord.id,
          receivableId: currentRecord.receivableId,
          actionType: action,
          actionDate: form.get('actionDate'),
          note: form.get('note'),
          reason: form.get('reason'),
          attachmentId: attachment?.id ?? inheritedAttachmentId,
        }),
      });
      onOpenChange(false);
      await onDone('原催缴已作废，更正记录已追加并重新计算法律风险');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent className="lc-operation-sheet">
        <DialogHeader>
          <DialogTitle>作废并更正催缴</DialogTitle>
          <DialogDescription>
            原时间线记录会保留为已作废，并追加新的有效记录。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="app-record-context">
            <p className="font-medium text-[var(--app-text-strong)]">
              {record.projectName}
            </p>
            <p className="mt-1 text-muted-foreground">
              {record.receivableCode} · 原动作 {actionLabels[record.actionType]}{' '}
              · {record.actionDate}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="更正后动作" required>
              <NativeSelect
                className="w-full"
                value={action}
                onChange={(event) => {
                  setAction(event.target.value as CollectionAction);
                  setFile(null);
                  setUploaded(null);
                }}
              >
                {Object.entries(actionLabels).map(([value, label]) => (
                  <NativeSelectOption key={value} value={value}>
                    {label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="更正后日期" required>
              <Input
                name="actionDate"
                type="date"
                defaultValue={record.actionDate}
                required
              />
            </FormField>
          </div>
          <FormField label="更正后纪要">
            <Textarea name="note" defaultValue={record.note ?? ''} />
          </FormField>
          <AttachmentField
            label="替换附件"
            required={formal && !record.attachmentId}
            hint={
              existingAttachment
                ? `不选择新文件将沿用：${existingAttachment.fileName}`
                : formal
                  ? '正式函件附件必传。'
                  : '可选；支持 PDF、JPG、PNG。'
            }
            onChange={(next) => {
              setFile(next);
              setUploaded(null);
            }}
          />
          <FormField label="更正原因" required hint="原因将永久写入审计日志。">
            <Textarea
              name="reason"
              required
              placeholder="请说明原记录错误及更正依据"
            />
          </FormField>
          <ErrorText error={error} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={busy} aria-busy={busy}>
              {busy ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <PencilLine />
              )}
              作废并保存更正
            </Button>
          </DialogFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
