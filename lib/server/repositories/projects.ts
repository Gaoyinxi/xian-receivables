import { getRawDb } from '@/db/index';
import { currentBusinessDate } from '@/lib/server/data';
import { auditStatement, codeAllocation } from '@/lib/server/mutations';
import type { z } from 'zod';
import type { DemoSession } from '@/lib/types';
import { projectCreateSchema } from '@/lib/validation';
type Input = z.output<typeof projectCreateSchema>;

export async function insertProject(
  session: DemoSession,
  input: Input,
  district: { id: string; name: string },
) {
  const id = crypto.randomUUID();
  const code = codeAllocation(
    'projects',
    `XM-${currentBusinessDate().slice(0, 4)}-`,
  );
  const now = new Date().toISOString();
  const db = getRawDb();
  await db.batch([
    db
      .prepare(
        `INSERT INTO projects (
          id, project_code, name, contract_code, tags, district_id, org_level4,
          customer_name, customer_type, customer_contact, delivery_owner,
          account_manager, delivery_manager, status, contract_date,
          contract_amount_cents, amount_composition, billing_code, archived_at,
          created_by, created_at, updated_at
        ) VALUES (?, ${code.sql}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
      )
      .bind(
        id,
        ...code.bindings,
        input.name,
        input.contractCode,
        JSON.stringify(input.tags),
        district.id,
        input.orgLevel4,
        input.customerName,
        input.customerType,
        input.customerContact,
        input.deliveryOwner,
        input.accountManager,
        input.deliveryManager,
        input.status,
        input.contractDate,
        input.contractAmountYuan,
        input.amountComposition,
        input.billingCode || null,
        session.id,
        now,
        now,
      ),
    auditStatement({
      districtId: district.id,
      entityType: 'PROJECT',
      entityId: id,
      action: 'CREATE',
      newValue: {
        name: input.name,
        contractCode: input.contractCode,
      },
      source: 'MANUAL',
      actorRole: session.role,
      actorName: session.displayName,
    }),
  ]);
  const created = await db
    .prepare('SELECT project_code AS projectCode FROM projects WHERE id = ?')
    .bind(id)
    .first<{ projectCode: string }>();
  return { id, projectCode: created!.projectCode };
}

export async function findDistrict(code: string) {
  return await getRawDb()
    .prepare('SELECT id, name FROM districts WHERE code = ? OR name = ?')
    .bind(code, code)
    .first<{ id: string; name: string }>();
}

export async function findContract(code: string) {
  return await getRawDb()
    .prepare('SELECT id FROM projects WHERE contract_code = ?')
    .bind(code)
    .first();
}
