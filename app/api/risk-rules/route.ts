import { getRawDb } from '@/db/index';
import { ok, routeError } from '@/lib/server/api';
import { assertCanManageRisk } from '@/lib/server/authz';
import { getRiskRules } from '@/lib/server/data';
import { requireSession } from '@/lib/server/session';
import { riskRulesSchema } from '@/lib/validation';

export async function PUT(request: Request) {
  try {
    const session = await requireSession(request);
    assertCanManageRisk(session);
    const input = riskRulesSchema.parse(await request.json());
    const now = new Date().toISOString();
    const db = getRawDb();
    await db.batch([
      db
        .prepare(`INSERT INTO audit_logs (id, district_id, entity_type, entity_id, action,
        old_value, new_value, reason, source, actor_role, actor_name, created_at)
        SELECT ?, NULL, 'RISK_RULE', id, 'UPDATE',
        json_object('blueMinDays', blue_min_days, 'yellowMinDays', yellow_min_days,
          'redMinDays', red_min_days, 'legalLevel5MinMonths', legal_level5_min_months,
          'legalLevel4MinMonths', legal_level4_min_months, 'legalLevel3MinMonths', legal_level3_min_months,
          'legalLevel2MinMonths', legal_level2_min_months, 'legalLevel1MinMonths', legal_level1_min_months),
        ?, ?, 'MANUAL', ?, ?, ? FROM risk_rules WHERE id = 'default'`)
        .bind(
          crypto.randomUUID(),
          JSON.stringify(input),
          input.reason,
          session.role,
          session.displayName,
          now,
        ),
      db
        .prepare(`UPDATE risk_rules SET blue_min_days = ?, yellow_min_days = ?,
        red_min_days = ?, legal_level5_min_months = ?, legal_level4_min_months = ?,
        legal_level3_min_months = ?, legal_level2_min_months = ?, legal_level1_min_months = ?,
        updated_by = ?, updated_at = ? WHERE id = 'default'`)
        .bind(
          input.blueMinDays,
          input.yellowMinDays,
          input.redMinDays,
          input.legalLevel5MinMonths,
          input.legalLevel4MinMonths,
          input.legalLevel3MinMonths,
          input.legalLevel2MinMonths,
          input.legalLevel1MinMonths,
          session.id,
          now,
        ),
    ]);
    return ok(await getRiskRules());
  } catch (error) {
    return routeError(error);
  }
}
