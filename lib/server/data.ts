import { getRawDb } from '@/db/index';

import {
  calculateLegalRiskLevel,
  calculateRiskLevel,
  formatIsoDate,
  overdueDays,
} from '../domain';
import type {
  AttachmentRecord,
  AuditRecord,
  BootstrapData,
  CollectionRecord,
  DemoSession,
  DistrictRecord,
  ImportBatchRecord,
  ProjectRecord,
  ReceiptRecord,
  ReceivableRecord,
  RiskRuleRecord,
} from '../types';
import { BusinessError } from './api';

function todayInShanghai(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

async function all<T>(
  sql: string,
  bindings: Array<string | number | null> = [],
): Promise<T[]> {
  const statement = getRawDb().prepare(sql);
  const result = await (bindings.length
    ? statement.bind(...bindings).all<T>()
    : statement.all<T>());
  return result.results;
}

function parseTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

export async function getRiskRules(): Promise<RiskRuleRecord> {
  const rules = await getRawDb()
    .prepare(
      `SELECT id, blue_min_days AS blueMinDays,
        yellow_min_days AS yellowMinDays, red_min_days AS redMinDays,
        legal_level5_min_months AS legalLevel5MinMonths,
        legal_level4_min_months AS legalLevel4MinMonths,
        legal_level3_min_months AS legalLevel3MinMonths,
        legal_level2_min_months AS legalLevel2MinMonths,
        legal_level1_min_months AS legalLevel1MinMonths,
        updated_by AS updatedBy, updated_at AS updatedAt
      FROM risk_rules WHERE id = 'default'`,
    )
    .first<RiskRuleRecord>();
  if (!rules) throw new Error('RISK_RULES_MISSING');
  return rules;
}

export async function getBootstrapData(
  session: DemoSession,
): Promise<BootstrapData> {
  const districtFilter =
    session.role === 'CITY_ADMIN'
      ? { clause: '', bindings: [] }
      : {
          clause: 'WHERE p.district_id = ?',
          bindings: [session.districtId],
        };

  const [
    districts,
    projectRows,
    receivableRows,
    receiptRows,
    collectionRows,
    attachmentRows,
    auditRows,
    importRows,
    riskRules,
  ] = await Promise.all([
    all<DistrictRecord>('SELECT id, code, name FROM districts ORDER BY name'),
    all<
      Omit<ProjectRecord, 'tags'> & {
        tags: string;
      }
    >(
      `SELECT p.id, p.project_code AS projectCode, p.name,
        p.contract_code AS contractCode, p.tags, p.district_id AS districtId,
        d.code AS districtCode, d.name AS districtName,
        p.org_level4 AS orgLevel4, p.customer_name AS customerName,
        p.customer_type AS customerType, p.customer_contact AS customerContact,
        p.delivery_owner AS deliveryOwner, p.account_manager AS accountManager,
        p.delivery_manager AS deliveryManager, p.status,
        p.contract_date AS contractDate,
        p.contract_amount_cents AS contractAmountCents,
        p.amount_composition AS amountComposition,
        p.billing_code AS billingCode, p.archived_at AS archivedAt,
        COUNT(r.id) AS receivableCount,
        COALESCE(SUM(r.amount_cents), 0) AS receivableAmountCents,
        COALESCE(SUM(rt.received_amount_cents), 0) AS receivedAmountCents,
        p.created_at AS createdAt
      FROM projects p
      JOIN districts d ON d.id = p.district_id
      LEFT JOIN receivables r ON r.project_id = p.id
      LEFT JOIN (
        SELECT receivable_id, SUM(amount_cents) AS received_amount_cents
        FROM receipts WHERE status = 'VALID' GROUP BY receivable_id
      ) rt ON rt.receivable_id = r.id
      ${districtFilter.clause}
      GROUP BY p.id
      ORDER BY p.archived_at IS NOT NULL, p.created_at DESC`,
      districtFilter.bindings,
    ),
    all<
      Omit<
        ReceivableRecord,
        | 'remainingAmountCents'
        | 'overdueDays'
        | 'riskLevel'
        | 'legalRiskLevel'
        | 'collectionMissing'
      >
    >(
      `SELECT r.id, r.receivable_code AS receivableCode,
        r.project_id AS projectId, p.project_code AS projectCode,
        p.name AS projectName, p.contract_code AS contractCode,
        p.district_id AS districtId, d.code AS districtCode,
        d.name AS districtName, r.sequence_no AS sequenceNo,
        r.payment_type AS paymentType, r.amount_cents AS amountCents,
        COALESCE(rt.received_amount_cents, 0) AS receivedAmountCents,
        r.payment_condition AS paymentCondition,
        r.baseline_event AS baselineEvent, r.baseline_date AS baselineDate,
        r.term_days AS termDays, r.due_date AS dueDate,
        r.acceptance_type AS acceptanceType,
        r.acceptance_date AS acceptanceDate,
        r.invoice_status AS invoiceStatus,
        r.invoice_delivered_date AS invoiceDeliveredDate,
        r.overdue_reason AS overdueReason,
        r.confirmation_status AS confirmationStatus,
        r.writeoff_status AS writeoffStatus,
        (
          SELECT ce.action_date FROM collection_events ce
          WHERE ce.receivable_id = r.id AND ce.status = 'VALID'
          ORDER BY ce.action_date DESC, ce.created_at DESC LIMIT 1
        ) AS latestCollectionDate,
        (
          SELECT ce.action_type FROM collection_events ce
          WHERE ce.receivable_id = r.id AND ce.status = 'VALID'
          ORDER BY ce.action_date DESC, ce.created_at DESC LIMIT 1
        ) AS latestCollectionAction,
        r.created_at AS createdAt
      FROM receivables r
      JOIN projects p ON p.id = r.project_id
      JOIN districts d ON d.id = p.district_id
      LEFT JOIN (
        SELECT receivable_id, SUM(amount_cents) AS received_amount_cents
        FROM receipts WHERE status = 'VALID' GROUP BY receivable_id
      ) rt ON rt.receivable_id = r.id
      ${districtFilter.clause}
      ORDER BY r.due_date, r.receivable_code`,
      districtFilter.bindings,
    ),
    all<ReceiptRecord>(
      `SELECT rr.id, rr.receivable_id AS receivableId,
        r.receivable_code AS receivableCode, p.name AS projectName,
        p.district_id AS districtId, d.name AS districtName,
        rr.amount_cents AS amountCents, rr.received_date AS receivedDate,
        rr.note, rr.attachment_id AS attachmentId,
        a.file_name AS attachmentName, rr.status,
        rr.void_reason AS voidReason, rr.correction_of_id AS correctionOfId,
        rr.created_by_name AS createdByName, rr.created_at AS createdAt,
        rr.voided_at AS voidedAt
      FROM receipts rr
      JOIN receivables r ON r.id = rr.receivable_id
      JOIN projects p ON p.id = r.project_id
      JOIN districts d ON d.id = p.district_id
      LEFT JOIN attachments a ON a.id = rr.attachment_id
      ${districtFilter.clause}
      ORDER BY rr.created_at DESC`,
      districtFilter.bindings,
    ),
    all<CollectionRecord>(
      `SELECT ce.id, ce.receivable_id AS receivableId,
        r.receivable_code AS receivableCode, p.name AS projectName,
        p.district_id AS districtId, d.name AS districtName,
        ce.action_type AS actionType, ce.action_date AS actionDate,
        ce.note, ce.attachment_id AS attachmentId,
        a.file_name AS attachmentName, ce.status,
        ce.void_reason AS voidReason, ce.correction_of_id AS correctionOfId,
        ce.created_by_name AS createdByName, ce.created_at AS createdAt,
        ce.voided_at AS voidedAt
      FROM collection_events ce
      JOIN receivables r ON r.id = ce.receivable_id
      JOIN projects p ON p.id = r.project_id
      JOIN districts d ON d.id = p.district_id
      LEFT JOIN attachments a ON a.id = ce.attachment_id
      ${districtFilter.clause}
      ORDER BY ce.action_date DESC, ce.created_at DESC`,
      districtFilter.bindings,
    ),
    all<AttachmentRecord>(
      `SELECT id, entity_type AS entityType, entity_id AS entityId,
        file_name AS fileName, content_type AS contentType,
        size_bytes AS sizeBytes, created_at AS createdAt
      FROM attachments ORDER BY created_at DESC`,
    ),
    all<AuditRecord>(
      `SELECT al.id, al.district_id AS districtId, d.name AS districtName,
        al.entity_type AS entityType, al.entity_id AS entityId,
        al.action, al.field_name AS fieldName, al.old_value AS oldValue,
        al.new_value AS newValue, al.reason, al.source,
        al.actor_role AS actorRole, al.actor_name AS actorName,
        al.created_at AS createdAt
      FROM audit_logs al
      LEFT JOIN districts d ON d.id = al.district_id
      ${session.role === 'CITY_ADMIN' ? '' : 'WHERE al.district_id = ?'}
      ORDER BY al.created_at DESC LIMIT 300`,
      session.role === 'CITY_ADMIN' ? [] : [session.districtId],
    ),
    all<ImportBatchRecord>(
      `SELECT id, kind, file_name AS fileName, total_rows AS totalRows,
        valid_rows AS validRows, invalid_rows AS invalidRows,
        committed_rows AS committedRows, status,
        created_at AS createdAt, committed_at AS committedAt
      FROM import_batches
      ${session.role === 'CITY_ADMIN' ? '' : 'WHERE district_id = ?'}
      ORDER BY created_at DESC LIMIT 50`,
      session.role === 'CITY_ADMIN' ? [] : [session.districtId],
    ),
    getRiskRules(),
  ]);

  const projects = projectRows.map((project) => ({
    ...project,
    tags: parseTags(project.tags),
    receivableCount: Number(project.receivableCount),
    receivableAmountCents: Number(project.receivableAmountCents),
    receivedAmountCents: Number(project.receivedAmountCents),
  }));

  const today = todayInShanghai();
  const receivables = receivableRows.map((receivable) => {
    const receivedAmountCents = Number(receivable.receivedAmountCents);
    const remainingAmountCents = Math.max(
      0,
      Number(receivable.amountCents) - receivedAmountCents,
    );
    const days =
      receivable.confirmationStatus === 'DRAFT'
        ? 0
        : overdueDays(receivable.dueDate, today, receivable.writeoffStatus);
    const referenceDate =
      receivable.latestCollectionDate ?? (days > 0 ? receivable.dueDate : null);
    return {
      ...receivable,
      amountCents: Number(receivable.amountCents),
      receivedAmountCents,
      remainingAmountCents,
      sequenceNo: Number(receivable.sequenceNo),
      termDays: Number(receivable.termDays),
      overdueDays: days,
      riskLevel:
        receivable.confirmationStatus === 'DRAFT'
          ? 'NONE'
          : calculateRiskLevel(
              receivable.dueDate,
              today,
              receivable.writeoffStatus,
              riskRules,
            ),
      legalRiskLevel:
        receivable.confirmationStatus === 'DRAFT'
          ? null
          : calculateLegalRiskLevel(
              referenceDate,
              today,
              receivable.writeoffStatus,
              riskRules,
            ),
      collectionMissing:
        days > 0 &&
        !receivable.latestCollectionDate &&
        receivable.writeoffStatus !== 'PAID',
    };
  });

  const visibleProjectIds = new Set(projects.map((item) => item.id));
  const visibleReceivableIds = new Set(receivables.map((item) => item.id));
  const attachments = attachmentRows.filter((attachment) =>
    attachment.entityType === 'PROJECT'
      ? visibleProjectIds.has(attachment.entityId)
      : visibleReceivableIds.has(attachment.entityId),
  );

  const summary = {
    pendingConfirmationCount: receivables.filter(
      (item) => item.confirmationStatus === 'DRAFT',
    ).length,
    remainingAmountCents: receivables
      .filter((item) => item.confirmationStatus === 'CONFIRMED')
      .reduce((sum, item) => sum + item.remainingAmountCents, 0),
    partialCount: receivables.filter(
      (item) => item.writeoffStatus === 'PARTIAL',
    ).length,
    overdueWithoutCollectionCount: receivables.filter(
      (item) => item.collectionMissing,
    ).length,
    totalReceivableCount: receivables.length,
    receivedAmountCents: receivables.reduce(
      (sum, item) => sum + item.receivedAmountCents,
      0,
    ),
  };

  return {
    session,
    districts,
    summary,
    projects,
    receivables,
    receipts: receiptRows.map((item) => ({
      ...item,
      amountCents: Number(item.amountCents),
    })),
    collections: collectionRows,
    attachments,
    auditLogs: auditRows,
    importBatches: importRows.map((item) => ({
      ...item,
      totalRows: Number(item.totalRows),
      validRows: Number(item.validRows),
      invalidRows: Number(item.invalidRows),
      committedRows: Number(item.committedRows),
    })),
    riskRules,
  };
}

export interface ReceivableScope {
  id: string;
  receivableCode: string;
  projectId: string;
  projectName: string;
  districtId: string;
  amountCents: number;
  confirmationStatus: 'DRAFT' | 'CONFIRMED';
  writeoffStatus: 'UNPAID' | 'PARTIAL' | 'PAID';
}

export async function getReceivableScope(
  idOrCode: string,
): Promise<ReceivableScope> {
  const row = await getRawDb()
    .prepare(
      `SELECT r.id, r.receivable_code AS receivableCode,
        r.project_id AS projectId, p.name AS projectName,
        p.district_id AS districtId, r.amount_cents AS amountCents,
        r.confirmation_status AS confirmationStatus,
        r.writeoff_status AS writeoffStatus
      FROM receivables r JOIN projects p ON p.id = r.project_id
      WHERE r.id = ? OR r.receivable_code = ?`,
    )
    .bind(idOrCode, idOrCode)
    .first<ReceivableScope>();
  if (!row) {
    throw new BusinessError('RECEIVABLE_NOT_FOUND', '未找到对应应收记录', 404);
  }
  return { ...row, amountCents: Number(row.amountCents) };
}

export async function getProjectScope(idOrCode: string): Promise<{
  id: string;
  projectCode: string;
  districtId: string;
  contractDate: string;
}> {
  const row = await getRawDb()
    .prepare(
      `SELECT id, project_code AS projectCode, district_id AS districtId,
        contract_date AS contractDate
      FROM projects WHERE id = ? OR project_code = ?`,
    )
    .bind(idOrCode, idOrCode)
    .first<{
      id: string;
      projectCode: string;
      districtId: string;
      contractDate: string;
    }>();
  if (!row) throw new BusinessError('PROJECT_NOT_FOUND', '未找到项目', 404);
  return row;
}

export async function getReceiptScope(id: string): Promise<{
  id: string;
  receivableId: string;
  districtId: string;
  status: string;
  amountCents: number;
  receivedDate: string;
  note: string | null;
  attachmentId: string | null;
}> {
  const row = await getRawDb()
    .prepare(
      `SELECT rr.id, rr.receivable_id AS receivableId,
        p.district_id AS districtId, rr.status, rr.amount_cents AS amountCents,
        rr.received_date AS receivedDate, rr.note, rr.attachment_id AS attachmentId
      FROM receipts rr
      JOIN receivables r ON r.id = rr.receivable_id
      JOIN projects p ON p.id = r.project_id
      WHERE rr.id = ?`,
    )
    .bind(id)
    .first<{
      id: string;
      receivableId: string;
      districtId: string;
      status: string;
      amountCents: number;
      receivedDate: string;
      note: string | null;
      attachmentId: string | null;
    }>();
  if (!row) throw new BusinessError('RECEIPT_NOT_FOUND', '未找到回款记录', 404);
  return row;
}

export async function getCollectionScope(id: string): Promise<{
  id: string;
  receivableId: string;
  districtId: string;
  status: string;
  actionType: string;
  actionDate: string;
  note: string | null;
  attachmentId: string | null;
}> {
  const row = await getRawDb()
    .prepare(
      `SELECT ce.id, ce.receivable_id AS receivableId,
        p.district_id AS districtId, ce.status, ce.action_type AS actionType,
        ce.action_date AS actionDate, ce.note, ce.attachment_id AS attachmentId
      FROM collection_events ce
      JOIN receivables r ON r.id = ce.receivable_id
      JOIN projects p ON p.id = r.project_id
      WHERE ce.id = ?`,
    )
    .bind(id)
    .first<{
      id: string;
      receivableId: string;
      districtId: string;
      status: string;
      actionType: string;
      actionDate: string;
      note: string | null;
      attachmentId: string | null;
    }>();
  if (!row) {
    throw new BusinessError('COLLECTION_NOT_FOUND', '未找到催缴记录', 404);
  }
  return row;
}

export async function getAttachmentScope(id: string): Promise<{
  id: string;
  objectKey: string;
  fileName: string;
  contentType: string;
  entityType: string;
  entityId: string;
  districtId: string;
}> {
  const attachment = await getRawDb()
    .prepare(
      `SELECT id, object_key AS objectKey, file_name AS fileName,
        content_type AS contentType, entity_type AS entityType,
        entity_id AS entityId
      FROM attachments WHERE id = ?`,
    )
    .bind(id)
    .first<{
      id: string;
      objectKey: string;
      fileName: string;
      contentType: string;
      entityType: string;
      entityId: string;
    }>();
  if (!attachment) {
    throw new BusinessError('ATTACHMENT_NOT_FOUND', '未找到附件', 404);
  }
  const scope =
    attachment.entityType === 'PROJECT'
      ? await getProjectScope(attachment.entityId)
      : await getReceivableScope(attachment.entityId);
  return { ...attachment, districtId: scope.districtId };
}

export function currentBusinessDate(): string {
  return formatIsoDate(new Date(`${todayInShanghai()}T00:00:00.000Z`));
}
