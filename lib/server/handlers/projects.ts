// Shared business handler: used by both Sites and the independent Node API.
import { getRawDb } from '@/db/index';
import { assertCanManageProject } from '@/lib/server/authz';
import { BusinessError, ok, routeError } from '@/lib/server/api';
import { currentBusinessDate } from '@/lib/server/data';
import { auditStatement, codeAllocation } from '@/lib/server/mutations';
import { requireSession } from '@/lib/server/session';
import { projectCreateSchema } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    assertCanManageProject(session);
    const input = projectCreateSchema.parse(await request.json());
    const district = await getRawDb()
      .prepare('SELECT id, name FROM districts WHERE code = ? OR name = ?')
      .bind(input.districtCode, input.districtCode)
      .first<{ id: string; name: string }>();
    if (!district) {
      throw new BusinessError('DISTRICT_NOT_FOUND', '未找到归属区县', 400, {
        districtCode: ['请选择碑林、雁塔或莲湖'],
      });
    }
    const duplicate = await getRawDb()
      .prepare('SELECT id FROM projects WHERE contract_code = ?')
      .bind(input.contractCode)
      .first();
    if (duplicate) {
      throw new BusinessError(
        'DUPLICATE_CONTRACT',
        '合同编码已存在，请检查',
        409,
        { contractCode: ['合同编码已存在'] },
      );
    }

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
    return ok({ id, projectCode: created!.projectCode }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
