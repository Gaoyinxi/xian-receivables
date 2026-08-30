import type {
  CollectionAction,
  RiskLevel,
  RiskRuleRecord,
  Role,
  WriteoffStatus,
} from './types';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FORMAL_COLLECTION_ACTIONS = new Set<CollectionAction>([
  'COLLECTION_LETTER',
  'LAWYER_LETTER',
  'LITIGATION_LETTER',
]);

export const DEFAULT_RISK_RULES: Omit<
  RiskRuleRecord,
  'id' | 'updatedBy' | 'updatedAt'
> = {
  blueMinDays: 1,
  yellowMinDays: 30,
  redMinDays: 90,
  legalLevel5MinMonths: 1,
  legalLevel4MinMonths: 7,
  legalLevel3MinMonths: 13,
  legalLevel2MinMonths: 19,
  legalLevel1MinMonths: 24,
};

export function parseIsoDate(value: string): Date | null {
  if (!DATE_PATTERN.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && parseIsoDate(value) !== null;
}

export function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addCalendarDays(dateValue: string, days: number): string {
  const date = parseIsoDate(dateValue);
  if (!date || !Number.isInteger(days) || days < 0) {
    throw new Error('INVALID_DATE_OR_TERM');
  }
  date.setUTCDate(date.getUTCDate() + days);
  return formatIsoDate(date);
}

export function daysBetween(fromValue: string, toValue: string): number {
  const from = parseIsoDate(fromValue);
  const to = parseIsoDate(toValue);
  if (!from || !to) throw new Error('INVALID_DATE');
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

export function overdueDays(
  dueDate: string,
  today: string,
  writeoffStatus: WriteoffStatus,
): number {
  if (writeoffStatus === 'PAID') return 0;
  return Math.max(0, daysBetween(dueDate, today));
}

export function calculateWriteoffStatus(
  amountCents: number,
  validReceiptAmounts: number[],
): WriteoffStatus {
  const received = validReceiptAmounts.reduce((sum, value) => sum + value, 0);
  if (received <= 0) return 'UNPAID';
  if (received >= amountCents) return 'PAID';
  return 'PARTIAL';
}

export function shouldArchiveProject(
  receivableCount: number,
  openReceivableCount: number,
): boolean {
  return receivableCount > 0 && openReceivableCount === 0;
}

export function calculateRiskLevel(
  dueDate: string,
  today: string,
  writeoffStatus: WriteoffStatus,
  rules: Pick<RiskRuleRecord, 'blueMinDays' | 'yellowMinDays' | 'redMinDays'>,
): RiskLevel {
  if (writeoffStatus === 'PAID') return 'NONE';
  const days = overdueDays(dueDate, today, writeoffStatus);
  if (days < rules.blueMinDays) return 'NONE';
  if (days >= rules.redMinDays) return 'RED';
  if (days >= rules.yellowMinDays) return 'YELLOW';
  return 'BLUE';
}

export function elapsedWholeMonths(fromValue: string, toValue: string): number {
  const from = parseIsoDate(fromValue);
  const to = parseIsoDate(toValue);
  if (!from || !to || to < from) return 0;
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    to.getUTCMonth() -
    from.getUTCMonth();
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

export function calculateLegalRiskLevel(
  referenceDate: string | null,
  today: string,
  writeoffStatus: WriteoffStatus,
  rules: Pick<
    RiskRuleRecord,
    | 'legalLevel5MinMonths'
    | 'legalLevel4MinMonths'
    | 'legalLevel3MinMonths'
    | 'legalLevel2MinMonths'
    | 'legalLevel1MinMonths'
  >,
): number | null {
  if (!referenceDate || writeoffStatus === 'PAID') return null;
  const months = elapsedWholeMonths(referenceDate, today);
  if (months >= rules.legalLevel1MinMonths) return 1;
  if (months >= rules.legalLevel2MinMonths) return 2;
  if (months >= rules.legalLevel3MinMonths) return 3;
  if (months >= rules.legalLevel4MinMonths) return 4;
  if (months >= rules.legalLevel5MinMonths) return 5;
  return 6;
}

export function yuanToCents(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.round(value * 100);
  }
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replaceAll(',', '');
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function formatYuan(cents: number): string {
  return (cents / 100).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function isFormalCollectionAction(action: CollectionAction): boolean {
  return FORMAL_COLLECTION_ACTIONS.has(action);
}

export function canReadDistrict(
  role: Role,
  sessionDistrictId: string | null,
  targetDistrictId: string,
): boolean {
  return role === 'CITY_ADMIN' || sessionDistrictId === targetDistrictId;
}

export function canManageProject(role: Role): boolean {
  return role === 'CITY_ADMIN';
}

export function canManageReceivable(
  role: Role,
  sessionDistrictId: string | null,
  targetDistrictId: string,
): boolean {
  return (
    role === 'CITY_ADMIN' ||
    (role === 'DISTRICT_ADMIN' && sessionDistrictId === targetDistrictId)
  );
}

export function canCreateOperationalRecord(
  role: Role,
  sessionDistrictId: string | null,
  targetDistrictId: string,
): boolean {
  return (
    role === 'CITY_ADMIN' ||
    ((role === 'DISTRICT_ADMIN' || role === 'DISTRICT_OPERATOR') &&
      sessionDistrictId === targetDistrictId)
  );
}

export function canCorrectOperationalRecord(
  role: Role,
  sessionDistrictId: string | null,
  targetDistrictId: string,
): boolean {
  return (
    role === 'CITY_ADMIN' ||
    (role === 'DISTRICT_ADMIN' && sessionDistrictId === targetDistrictId)
  );
}

export function canConfirmReceivable(role: Role): boolean {
  return role === 'CITY_ADMIN';
}

export function canManageRiskRules(role: Role): boolean {
  return role === 'CITY_ADMIN';
}
