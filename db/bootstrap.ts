import { getRawDb } from './index';

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS districts (
    id TEXT PRIMARY KEY NOT NULL,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS demo_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    role TEXT NOT NULL,
    district_id TEXT,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (district_id) REFERENCES districts(id)
  )`,
  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY NOT NULL,
    project_code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    contract_code TEXT NOT NULL UNIQUE,
    tags TEXT NOT NULL DEFAULT '[]',
    district_id TEXT NOT NULL,
    org_level4 TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_type TEXT NOT NULL,
    customer_contact TEXT NOT NULL,
    delivery_owner TEXT NOT NULL,
    account_manager TEXT NOT NULL,
    delivery_manager TEXT NOT NULL,
    status TEXT NOT NULL,
    contract_date TEXT NOT NULL,
    contract_amount_cents INTEGER NOT NULL,
    amount_composition TEXT NOT NULL,
    billing_code TEXT,
    archived_at TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (district_id) REFERENCES districts(id)
  )`,
  `CREATE TABLE IF NOT EXISTS receivables (
    id TEXT PRIMARY KEY NOT NULL,
    receivable_code TEXT NOT NULL UNIQUE,
    project_id TEXT NOT NULL,
    sequence_no INTEGER NOT NULL,
    payment_type TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    payment_condition TEXT NOT NULL,
    baseline_event TEXT NOT NULL,
    baseline_date TEXT NOT NULL,
    term_days INTEGER NOT NULL,
    due_date TEXT NOT NULL,
    acceptance_type TEXT,
    acceptance_date TEXT,
    invoice_status TEXT,
    invoice_delivered_date TEXT,
    overdue_reason TEXT,
    confirmation_status TEXT NOT NULL DEFAULT 'DRAFT',
    writeoff_status TEXT NOT NULL DEFAULT 'UNPAID',
    confirmed_by TEXT,
    confirmed_at TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id),
    UNIQUE (project_id, sequence_no)
  )`,
  `CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    object_key TEXT NOT NULL UNIQUE,
    file_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    uploaded_by TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS receipts (
    id TEXT PRIMARY KEY NOT NULL,
    receivable_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    received_date TEXT NOT NULL,
    note TEXT,
    attachment_id TEXT,
    status TEXT NOT NULL DEFAULT 'VALID',
    void_reason TEXT,
    correction_of_id TEXT,
    created_by TEXT NOT NULL,
    created_by_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    voided_by TEXT,
    voided_at TEXT,
    FOREIGN KEY (receivable_id) REFERENCES receivables(id),
    FOREIGN KEY (attachment_id) REFERENCES attachments(id)
  )`,
  `CREATE TABLE IF NOT EXISTS collection_events (
    id TEXT PRIMARY KEY NOT NULL,
    receivable_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    action_date TEXT NOT NULL,
    note TEXT,
    attachment_id TEXT,
    status TEXT NOT NULL DEFAULT 'VALID',
    void_reason TEXT,
    correction_of_id TEXT,
    created_by TEXT NOT NULL,
    created_by_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    voided_by TEXT,
    voided_at TEXT,
    FOREIGN KEY (receivable_id) REFERENCES receivables(id),
    FOREIGN KEY (attachment_id) REFERENCES attachments(id)
  )`,
  `CREATE TABLE IF NOT EXISTS risk_rules (
    id TEXT PRIMARY KEY NOT NULL,
    blue_min_days INTEGER NOT NULL,
    yellow_min_days INTEGER NOT NULL,
    red_min_days INTEGER NOT NULL,
    legal_level5_min_months INTEGER NOT NULL,
    legal_level4_min_months INTEGER NOT NULL,
    legal_level3_min_months INTEGER NOT NULL,
    legal_level2_min_months INTEGER NOT NULL,
    legal_level1_min_months INTEGER NOT NULL,
    updated_by TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS import_batches (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL,
    file_name TEXT NOT NULL,
    total_rows INTEGER NOT NULL,
    valid_rows INTEGER NOT NULL,
    invalid_rows INTEGER NOT NULL,
    committed_rows INTEGER NOT NULL DEFAULT 0,
    district_id TEXT,
    status TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    committed_at TEXT,
    FOREIGN KEY (district_id) REFERENCES districts(id)
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY NOT NULL,
    district_id TEXT,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    field_name TEXT,
    old_value TEXT,
    new_value TEXT,
    reason TEXT,
    source TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (district_id) REFERENCES districts(id)
  )`,
  `CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_demo_sessions_district ON demo_sessions(district_id)',
  'CREATE INDEX IF NOT EXISTS idx_projects_district_archived ON projects(district_id, archived_at)',
  'CREATE INDEX IF NOT EXISTS idx_receivables_project_status ON receivables(project_id, confirmation_status, writeoff_status)',
  'CREATE INDEX IF NOT EXISTS idx_receipts_receivable_status ON receipts(receivable_id, status)',
  'CREATE INDEX IF NOT EXISTS idx_receipts_correction ON receipts(correction_of_id)',
  'CREATE INDEX IF NOT EXISTS idx_collections_receivable_status_date ON collection_events(receivable_id, status, action_date)',
  'CREATE INDEX IF NOT EXISTS idx_collections_correction ON collection_events(correction_of_id)',
  'CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(entity_type, entity_id)',
  'CREATE INDEX IF NOT EXISTS idx_import_batches_district_created ON import_batches(district_id, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_audit_logs_district_created ON audit_logs(district_id, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id)',
] as const;

const SEED_TIMESTAMP = '2026-08-30T02:00:00.000Z';

async function seedDatabase() {
  const db = getRawDb();
  const districtRows = [
    ['dist-beilin', 'BEILIN', '碑林区'],
    ['dist-yanta', 'YANTA', '雁塔区'],
    ['dist-lianhu', 'LIANHU', '莲湖区'],
  ] as const;

  const projectRows = [
    [
      'proj-beilin-community',
      'XM-2026-0001',
      '智慧社区综合服务平台',
      'HT-BL-2026-018',
      '["数智签约","权责项目"]',
      'dist-beilin',
      '碑林政企客户团队',
      '西安某公共服务单位',
      '政府',
      '客户联系人甲',
      '交付负责人甲',
      '客户经理甲',
      '交付经理甲',
      '验收中',
      '2026-02-18',
      245_000_000,
      'ICT（税率6%）',
      'FF-BL-0018',
      null,
    ],
    [
      'proj-yanta-data',
      'XM-2026-0002',
      '政务数据治理一期项目',
      'HT-YT-2026-009',
      '["信产签约"]',
      'dist-yanta',
      '雁塔政企客户团队',
      '西安某数据服务单位',
      '政府',
      '客户联系人乙',
      '交付负责人乙',
      '客户经理乙',
      '交付经理乙',
      '执行中',
      '2026-01-12',
      420_000_000,
      'ICT（税率6%）',
      'FF-YT-0009',
      null,
    ],
    [
      'proj-lianhu-network',
      'XM-2026-0003',
      '基层网络改造集成项目',
      'HT-LH-2026-026',
      '["数智签约"]',
      'dist-lianhu',
      '莲湖政企客户团队',
      '西安某基层治理单位',
      '政府',
      '客户联系人丙',
      '交付负责人丙',
      '客户经理丙',
      '交付经理丙',
      '执行中',
      '2026-04-10',
      168_000_000,
      '标品',
      'FF-LH-0026',
      null,
    ],
    [
      'proj-beilin-cloud',
      'XM-2026-0004',
      '公共服务云资源扩容项目',
      'HT-BL-2026-033',
      '["确认欠费"]',
      'dist-beilin',
      '碑林政企客户团队',
      '西安某公共事业单位',
      '企业',
      '客户联系人丁',
      '交付负责人丁',
      '客户经理丁',
      '交付经理丁',
      '执行中',
      '2026-08-01',
      195_000_000,
      '标品',
      null,
      null,
    ],
    [
      'proj-yanta-security',
      'XM-2025-0018',
      '城域网安全能力提升项目',
      'HT-YT-2025-071',
      '["权责项目"]',
      'dist-yanta',
      '雁塔政企客户团队',
      '西安某信息技术单位',
      '企业',
      '客户联系人戊',
      '交付负责人戊',
      '客户经理戊',
      '交付经理戊',
      '已关闭',
      '2025-06-20',
      132_000_000,
      'ICT（税率13%）',
      'FF-YT-0071',
      '2026-08-28T08:30:00.000Z',
    ],
    [
      'proj-lianhu-platform',
      'XM-2025-0024',
      '城市运行协同平台项目',
      'HT-LH-2025-083',
      '["信产签约","确认欠费"]',
      'dist-lianhu',
      '莲湖政企客户团队',
      '西安某城市运行单位',
      '政府',
      '客户联系人己',
      '交付负责人己',
      '客户经理己',
      '交付经理己',
      '维保期',
      '2025-08-08',
      310_000_000,
      'ICT（税率6%）',
      'FF-LH-0083',
      null,
    ],
  ] as const;

  const receivableRows = [
    [
      'rec-beilin-community-1',
      'YS-202608-0031',
      'proj-beilin-community',
      1,
      '初验款',
      86_000_000,
      '初验合格并递交发票后30日内支付',
      'PRE_ACCEPTANCE',
      '2026-06-18',
      30,
      '2026-07-18',
      '初验',
      '2026-06-18',
      '已递交',
      '2026-06-18',
      '客户内部付款审批尚未完成',
      'CONFIRMED',
      'UNPAID',
    ],
    [
      'rec-yanta-data-1',
      'YS-202608-0027',
      'proj-yanta-data',
      1,
      '进度款',
      156_000_000,
      '完成阶段成果并确认后30日内支付',
      'OTHER',
      '2026-07-06',
      30,
      '2026-08-05',
      null,
      null,
      '已递交',
      '2026-07-06',
      '客户计划分两次支付',
      'CONFIRMED',
      'PARTIAL',
    ],
    [
      'rec-lianhu-network-1',
      'YS-202608-0022',
      'proj-lianhu-network',
      1,
      '终验款',
      42_500_000,
      '终验合格后45日内支付',
      'FINAL_ACCEPTANCE',
      '2026-08-01',
      45,
      '2026-09-15',
      '终验',
      '2026-08-01',
      '已开票',
      null,
      null,
      'CONFIRMED',
      'UNPAID',
    ],
    [
      'rec-beilin-cloud-1',
      'YS-202608-0035',
      'proj-beilin-cloud',
      1,
      '预付款',
      78_000_000,
      '合同签订后80日内支付预付款',
      'SIGNING',
      '2026-08-01',
      80,
      '2026-10-20',
      null,
      null,
      null,
      null,
      null,
      'DRAFT',
      'UNPAID',
    ],
    [
      'rec-yanta-security-1',
      'YS-202607-0018',
      'proj-yanta-security',
      1,
      '质保金',
      35_000_000,
      '维保期届满后30日内支付',
      'OTHER',
      '2026-07-29',
      30,
      '2026-08-28',
      null,
      null,
      '已递交',
      '2026-07-29',
      null,
      'CONFIRMED',
      'PAID',
    ],
    [
      'rec-lianhu-platform-1',
      'YS-202604-0008',
      'proj-lianhu-platform',
      1,
      '质保金',
      64_500_000,
      '终验后180日内支付质保金',
      'FINAL_ACCEPTANCE',
      '2025-10-17',
      180,
      '2026-04-15',
      '终验',
      '2025-10-17',
      '已递交',
      '2025-10-18',
      '验收资料归档流程延迟',
      'CONFIRMED',
      'UNPAID',
    ],
  ] as const;

  const statements: D1PreparedStatement[] = [];

  for (const [id, code, name] of districtRows) {
    statements.push(
      db
        .prepare(
          'INSERT OR IGNORE INTO districts (id, code, name, created_at) VALUES (?, ?, ?, ?)',
        )
        .bind(id, code, name, SEED_TIMESTAMP),
    );
  }

  for (const project of projectRows) {
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO projects (
            id, project_code, name, contract_code, tags, district_id, org_level4,
            customer_name, customer_type, customer_contact, delivery_owner,
            account_manager, delivery_manager, status, contract_date,
            contract_amount_cents, amount_composition, billing_code, archived_at,
            created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(...project, 'SYSTEM_SEED', SEED_TIMESTAMP, SEED_TIMESTAMP),
    );
  }

  for (const receivable of receivableRows) {
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO receivables (
            id, receivable_code, project_id, sequence_no, payment_type,
            amount_cents, payment_condition, baseline_event, baseline_date,
            term_days, due_date, acceptance_type, acceptance_date, invoice_status,
            invoice_delivered_date, overdue_reason, confirmation_status,
            writeoff_status, confirmed_by, confirmed_at, created_by, created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          ...receivable,
          receivable[16] === 'CONFIRMED' ? 'SYSTEM_SEED' : null,
          receivable[16] === 'CONFIRMED' ? SEED_TIMESTAMP : null,
          'SYSTEM_SEED',
          SEED_TIMESTAMP,
          SEED_TIMESTAMP,
        ),
    );
  }

  statements.push(
    db
      .prepare(
        `INSERT OR IGNORE INTO receipts (
          id, receivable_id, amount_cents, received_date, note, status,
          created_by, created_by_name, created_at
        ) VALUES (?, ?, ?, ?, ?, 'VALID', ?, ?, ?)`,
      )
      .bind(
        'receipt-yanta-data-1',
        'rec-yanta-data-1',
        60_000_000,
        '2026-08-12',
        '客户首笔付款',
        'SYSTEM_SEED',
        '演示数据',
        '2026-08-12T03:20:00.000Z',
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO receipts (
          id, receivable_id, amount_cents, received_date, note, status,
          created_by, created_by_name, created_at
        ) VALUES (?, ?, ?, ?, ?, 'VALID', ?, ?, ?)`,
      )
      .bind(
        'receipt-yanta-security-1',
        'rec-yanta-security-1',
        35_000_000,
        '2026-08-28',
        '质保金全额到账',
        'SYSTEM_SEED',
        '演示数据',
        '2026-08-28T08:30:00.000Z',
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO collection_events (
          id, receivable_id, action_type, action_date, note, status,
          created_by, created_by_name, created_at
        ) VALUES (?, ?, ?, ?, ?, 'VALID', ?, ?, ?)`,
      )
      .bind(
        'collection-yanta-data-1',
        'rec-yanta-data-1',
        'WECHAT',
        '2026-08-20',
        '客户确认剩余款项正在审批',
        'SYSTEM_SEED',
        '演示数据',
        '2026-08-20T06:10:00.000Z',
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO collection_events (
          id, receivable_id, action_type, action_date, note, status,
          created_by, created_by_name, created_at
        ) VALUES (?, ?, ?, ?, ?, 'VALID', ?, ?, ?)`,
      )
      .bind(
        'collection-yanta-security-1',
        'rec-yanta-security-1',
        'MEETING',
        '2026-08-12',
        '双方确认付款日期',
        'SYSTEM_SEED',
        '演示数据',
        '2026-08-12T07:40:00.000Z',
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO collection_events (
          id, receivable_id, action_type, action_date, note, status,
          created_by, created_by_name, created_at
        ) VALUES (?, ?, ?, ?, ?, 'VALID', ?, ?, ?)`,
      )
      .bind(
        'collection-lianhu-platform-1',
        'rec-lianhu-platform-1',
        'MEETING',
        '2026-05-10',
        '客户要求补充验收归档资料',
        'SYSTEM_SEED',
        '演示数据',
        '2026-05-10T05:30:00.000Z',
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO risk_rules (
          id, blue_min_days, yellow_min_days, red_min_days,
          legal_level5_min_months, legal_level4_min_months,
          legal_level3_min_months, legal_level2_min_months,
          legal_level1_min_months, updated_by, updated_at
        ) VALUES ('default', 1, 30, 90, 1, 7, 13, 19, 24, ?, ?)`,
      )
      .bind('SYSTEM_SEED', SEED_TIMESTAMP),
  );

  const auditSeeds = [
    [
      'audit-seed-1',
      'dist-yanta',
      'RECEIPT',
      'receipt-yanta-data-1',
      'CREATE',
      null,
      null,
      '{"amountCents":60000000,"receivedDate":"2026-08-12"}',
      null,
      'SEED',
      'CITY_ADMIN',
      '演示数据',
      '2026-08-12T03:20:00.000Z',
    ],
    [
      'audit-seed-2',
      'dist-yanta',
      'COLLECTION',
      'collection-yanta-data-1',
      'CREATE',
      null,
      null,
      '{"actionType":"WECHAT","actionDate":"2026-08-20"}',
      null,
      'SEED',
      'DISTRICT_OPERATOR',
      '雁塔区填报人',
      '2026-08-20T06:10:00.000Z',
    ],
  ] as const;

  for (const audit of auditSeeds) {
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO audit_logs (
            id, district_id, entity_type, entity_id, action, field_name,
            old_value, new_value, reason, source, actor_role, actor_name,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(...audit),
    );
  }

  statements.push(
    db
      .prepare(
        "INSERT OR IGNORE INTO app_meta (key, value) VALUES ('seed_v1', ?)",
      )
      .bind(SEED_TIMESTAMP),
  );

  await db.batch(statements);
}

let initializationPromise: Promise<void> | null = null;

export function ensureDatabase(): Promise<void> {
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    const db = getRawDb();
    await db.batch(SCHEMA_STATEMENTS.map((sql) => db.prepare(sql)));
    const seed = await db
      .prepare("SELECT value FROM app_meta WHERE key = 'seed_v1'")
      .first<{ value: string }>();
    if (!seed) await seedDatabase();
    await db.prepare('PRAGMA optimize').run();
  })().catch((error) => {
    initializationPromise = null;
    throw error;
  });

  return initializationPromise;
}
