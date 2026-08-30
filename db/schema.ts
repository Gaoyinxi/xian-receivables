import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const districts = sqliteTable(
  'districts',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_districts_code').on(table.code),
    uniqueIndex('idx_districts_name').on(table.name),
  ],
);

export const demoSessions = sqliteTable(
  'demo_sessions',
  {
    id: text('id').primaryKey(),
    role: text('role').notNull(),
    districtId: text('district_id').references(() => districts.id),
    displayName: text('display_name').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_demo_sessions_district').on(table.districtId)],
);

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    projectCode: text('project_code').notNull(),
    name: text('name').notNull(),
    contractCode: text('contract_code').notNull(),
    tags: text('tags').notNull().default('[]'),
    districtId: text('district_id')
      .notNull()
      .references(() => districts.id),
    orgLevel4: text('org_level4').notNull(),
    customerName: text('customer_name').notNull(),
    customerType: text('customer_type').notNull(),
    customerContact: text('customer_contact').notNull(),
    deliveryOwner: text('delivery_owner').notNull(),
    accountManager: text('account_manager').notNull(),
    deliveryManager: text('delivery_manager').notNull(),
    status: text('status').notNull(),
    contractDate: text('contract_date').notNull(),
    contractAmountCents: integer('contract_amount_cents').notNull(),
    amountComposition: text('amount_composition').notNull(),
    billingCode: text('billing_code'),
    archivedAt: text('archived_at'),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_projects_project_code').on(table.projectCode),
    uniqueIndex('idx_projects_contract_code').on(table.contractCode),
    index('idx_projects_district_archived').on(table.districtId, table.archivedAt),
  ],
);

export const receivables = sqliteTable(
  'receivables',
  {
    id: text('id').primaryKey(),
    receivableCode: text('receivable_code').notNull(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    sequenceNo: integer('sequence_no').notNull(),
    paymentType: text('payment_type').notNull(),
    amountCents: integer('amount_cents').notNull(),
    paymentCondition: text('payment_condition').notNull(),
    baselineEvent: text('baseline_event').notNull(),
    baselineDate: text('baseline_date').notNull(),
    termDays: integer('term_days').notNull(),
    dueDate: text('due_date').notNull(),
    acceptanceType: text('acceptance_type'),
    acceptanceDate: text('acceptance_date'),
    invoiceStatus: text('invoice_status'),
    invoiceDeliveredDate: text('invoice_delivered_date'),
    overdueReason: text('overdue_reason'),
    confirmationStatus: text('confirmation_status').notNull().default('DRAFT'),
    writeoffStatus: text('writeoff_status').notNull().default('UNPAID'),
    confirmedBy: text('confirmed_by'),
    confirmedAt: text('confirmed_at'),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_receivables_code').on(table.receivableCode),
    uniqueIndex('idx_receivables_project_sequence').on(
      table.projectId,
      table.sequenceNo,
    ),
    index('idx_receivables_project_status').on(
      table.projectId,
      table.confirmationStatus,
      table.writeoffStatus,
    ),
  ],
);

export const attachments = sqliteTable(
  'attachments',
  {
    id: text('id').primaryKey(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    objectKey: text('object_key').notNull(),
    fileName: text('file_name').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    uploadedBy: text('uploaded_by').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_attachments_object_key').on(table.objectKey),
    index('idx_attachments_entity').on(table.entityType, table.entityId),
  ],
);

export const receipts = sqliteTable(
  'receipts',
  {
    id: text('id').primaryKey(),
    receivableId: text('receivable_id')
      .notNull()
      .references(() => receivables.id),
    amountCents: integer('amount_cents').notNull(),
    receivedDate: text('received_date').notNull(),
    note: text('note'),
    attachmentId: text('attachment_id').references(() => attachments.id),
    status: text('status').notNull().default('VALID'),
    voidReason: text('void_reason'),
    correctionOfId: text('correction_of_id'),
    createdBy: text('created_by').notNull(),
    createdByName: text('created_by_name').notNull(),
    createdAt: text('created_at').notNull(),
    voidedBy: text('voided_by'),
    voidedAt: text('voided_at'),
  },
  (table) => [
    index('idx_receipts_receivable_status').on(
      table.receivableId,
      table.status,
    ),
    index('idx_receipts_correction').on(table.correctionOfId),
  ],
);

export const collectionEvents = sqliteTable(
  'collection_events',
  {
    id: text('id').primaryKey(),
    receivableId: text('receivable_id')
      .notNull()
      .references(() => receivables.id),
    actionType: text('action_type').notNull(),
    actionDate: text('action_date').notNull(),
    note: text('note'),
    attachmentId: text('attachment_id').references(() => attachments.id),
    status: text('status').notNull().default('VALID'),
    voidReason: text('void_reason'),
    correctionOfId: text('correction_of_id'),
    createdBy: text('created_by').notNull(),
    createdByName: text('created_by_name').notNull(),
    createdAt: text('created_at').notNull(),
    voidedBy: text('voided_by'),
    voidedAt: text('voided_at'),
  },
  (table) => [
    index('idx_collections_receivable_status_date').on(
      table.receivableId,
      table.status,
      table.actionDate,
    ),
    index('idx_collections_correction').on(table.correctionOfId),
  ],
);

export const riskRules = sqliteTable('risk_rules', {
  id: text('id').primaryKey(),
  blueMinDays: integer('blue_min_days').notNull(),
  yellowMinDays: integer('yellow_min_days').notNull(),
  redMinDays: integer('red_min_days').notNull(),
  legalLevel5MinMonths: integer('legal_level5_min_months').notNull(),
  legalLevel4MinMonths: integer('legal_level4_min_months').notNull(),
  legalLevel3MinMonths: integer('legal_level3_min_months').notNull(),
  legalLevel2MinMonths: integer('legal_level2_min_months').notNull(),
  legalLevel1MinMonths: integer('legal_level1_min_months').notNull(),
  updatedBy: text('updated_by').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const importBatches = sqliteTable(
  'import_batches',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    fileName: text('file_name').notNull(),
    totalRows: integer('total_rows').notNull(),
    validRows: integer('valid_rows').notNull(),
    invalidRows: integer('invalid_rows').notNull(),
    committedRows: integer('committed_rows').notNull().default(0),
    districtId: text('district_id').references(() => districts.id),
    status: text('status').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
    committedAt: text('committed_at'),
  },
  (table) => [
    index('idx_import_batches_district_created').on(
      table.districtId,
      table.createdAt,
    ),
  ],
);

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    districtId: text('district_id').references(() => districts.id),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    action: text('action').notNull(),
    fieldName: text('field_name'),
    oldValue: text('old_value'),
    newValue: text('new_value'),
    reason: text('reason'),
    source: text('source').notNull(),
    actorRole: text('actor_role').notNull(),
    actorName: text('actor_name').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_audit_logs_district_created').on(
      table.districtId,
      table.createdAt,
    ),
    index('idx_audit_logs_entity').on(table.entityType, table.entityId),
  ],
);

export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
