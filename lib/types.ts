export type Role = 'CITY_ADMIN' | 'DISTRICT_ADMIN' | 'DISTRICT_OPERATOR';
export type ConfirmationStatus = 'DRAFT' | 'CONFIRMED';
export type WriteoffStatus = 'UNPAID' | 'PARTIAL' | 'PAID';
export type PaymentType = '预付款' | '进度款' | '初验款' | '终验款' | '质保金';
export type BaselineEvent =
  | 'SIGNING'
  | 'INVOICE'
  | 'PRE_ACCEPTANCE'
  | 'FINAL_ACCEPTANCE'
  | 'OTHER';
export type CollectionAction =
  | 'WECHAT'
  | 'MEETING'
  | 'COLLECTION_LETTER'
  | 'LAWYER_LETTER'
  | 'LITIGATION_LETTER'
  | 'LEADERSHIP';
export type ImportKind = 'PROJECT' | 'RECEIVABLE' | 'RECEIPT';
export type RiskLevel = 'NONE' | 'BLUE' | 'YELLOW' | 'RED';
export type RecordStatus = 'VALID' | 'VOIDED';

export interface RiskRuleRecord {
  id: string;
  blueMinDays: number;
  yellowMinDays: number;
  redMinDays: number;
  legalLevel5MinMonths: number;
  legalLevel4MinMonths: number;
  legalLevel3MinMonths: number;
  legalLevel2MinMonths: number;
  legalLevel1MinMonths: number;
  updatedBy: string;
  updatedAt: string;
}

export interface DemoSession {
  id: string;
  role: Role;
  districtId: string | null;
  districtCode: string | null;
  districtName: string | null;
  displayName: string;
  authMode?: 'DEMO' | 'PASSWORD';
  username?: string;
  mustChangePassword?: boolean;
}

export interface DistrictRecord {
  id: string;
  code: string;
  name: string;
}

export interface ProjectRecord {
  id: string;
  projectCode: string;
  name: string;
  contractCode: string;
  tags: string[];
  districtId: string;
  districtCode: string;
  districtName: string;
  orgLevel4: string;
  customerName: string;
  customerType: string;
  customerContact: string;
  deliveryOwner: string;
  accountManager: string;
  deliveryManager: string;
  status: string;
  contractDate: string;
  contractAmountCents: number;
  amountComposition: string;
  billingCode: string | null;
  archivedAt: string | null;
  receivableCount: number;
  receivableAmountCents: number;
  receivedAmountCents: number;
  createdAt: string;
  updatedAt?: string;
}

export interface ReceivableRecord {
  id: string;
  receivableCode: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  contractCode: string;
  districtId: string;
  districtCode: string;
  districtName: string;
  sequenceNo: number;
  paymentType: PaymentType;
  amountCents: number;
  receivedAmountCents: number;
  remainingAmountCents: number;
  paymentCondition: string;
  baselineEvent: BaselineEvent;
  baselineDate: string;
  termDays: number;
  dueDate: string;
  acceptanceType: string | null;
  acceptanceDate: string | null;
  invoiceStatus: string | null;
  invoiceDeliveredDate: string | null;
  overdueReason: string | null;
  confirmationStatus: ConfirmationStatus;
  writeoffStatus: WriteoffStatus;
  overdueDays: number;
  riskLevel: RiskLevel;
  legalRiskLevel: number | null;
  latestCollectionDate: string | null;
  latestCollectionAction: CollectionAction | null;
  collectionMissing: boolean;
  createdAt: string;
  confirmedAt?: string | null;
  updatedAt?: string;
}

export interface ReceiptRecord {
  id: string;
  receivableId: string;
  receivableCode: string;
  projectName: string;
  districtId: string;
  districtName: string;
  amountCents: number;
  receivedDate: string;
  note: string | null;
  attachmentId: string | null;
  attachmentName: string | null;
  status: RecordStatus;
  voidReason: string | null;
  correctionOfId: string | null;
  createdByName: string;
  createdAt: string;
  voidedAt: string | null;
}

export interface CollectionRecord {
  id: string;
  receivableId: string;
  receivableCode: string;
  projectName: string;
  districtId: string;
  districtName: string;
  actionType: CollectionAction;
  actionDate: string;
  note: string | null;
  attachmentId: string | null;
  attachmentName: string | null;
  status: RecordStatus;
  voidReason: string | null;
  correctionOfId: string | null;
  createdByName: string;
  createdAt: string;
  voidedAt: string | null;
}

export interface AttachmentRecord {
  id: string;
  entityType: string;
  entityId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface AuditRecord {
  id: string;
  districtId: string | null;
  districtName: string | null;
  entityType: string;
  entityId: string;
  action: string;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  source: string;
  actorRole: Role;
  actorName: string;
  createdAt: string;
}

export interface ImportBatchRecord {
  id: string;
  kind: ImportKind;
  fileName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  committedRows: number;
  status: string;
  createdAt: string;
  committedAt: string | null;
}

export interface DashboardSummary {
  pendingConfirmationCount: number;
  remainingAmountCents: number;
  partialCount: number;
  overdueWithoutCollectionCount: number;
  totalReceivableCount: number;
  receivedAmountCents: number;
}

export interface BootstrapData {
  businessDate?: string;
  session: DemoSession;
  districts: DistrictRecord[];
  summary: DashboardSummary;
  projects: ProjectRecord[];
  receivables: ReceivableRecord[];
  receipts: ReceiptRecord[];
  collections: CollectionRecord[];
  attachments: AttachmentRecord[];
  auditLogs: AuditRecord[];
  importBatches: ImportBatchRecord[];
  riskRules: RiskRuleRecord;
}

export type FieldErrors = Record<string, string[]>;

export interface RowError {
  row: number;
  code: string;
  message: string;
  fields?: string[];
}

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = {
  ok: false;
  code: string;
  message: string;
  fieldErrors?: FieldErrors;
  rowErrors?: RowError[];
};
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
