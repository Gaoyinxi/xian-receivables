import { getRawDb } from '@/db/index';
import { ok, routeError } from '@/lib/server/api';
import { assertCanManageRisk } from '@/lib/server/authz';
import { appendAudit, getRiskRules } from '@/lib/server/data';
import { requireSession } from '@/lib/server/session';
import { riskRulesSchema } from '@/lib/validation';

export async function PUT(request: Request) {
  try {
    const session = await requireSession(request);
    assertCanManageRisk(session);
    const input = riskRulesSchema.parse(await request.json());
    const oldRules = await getRiskRules();
    const now = new Date().toISOString();
    await getRawDb()
      .prepare(
        `UPDATE risk_rules SET blue_min_days = ?, yellow_min_days = ?,
          red_min_days = ?, legal_level5_min_months = ?,
          legal_level4_min_months = ?, legal_level3_min_months = ?,
          legal_level2_min_months = ?, legal_level1_min_months = ?,
          updated_by = ?, updated_at = ? WHERE id = 'default'`,
      )
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
      )
      .run();
    const newRules = await getRiskRules();
    await appendAudit({
      districtId: null,
      entityType: 'RISK_RULE',
      entityId: 'default',
      action: 'UPDATE',
      oldValue: oldRules,
      newValue: newRules,
      reason: input.reason,
      source: 'MANUAL',
      actorRole: session.role,
      actorName: session.displayName,
    });
    return ok(newRules);
  } catch (error) {
    return routeError(error);
  }
}
