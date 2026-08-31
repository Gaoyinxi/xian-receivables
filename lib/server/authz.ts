import {
  canConfirmReceivable,
  canCorrectOperationalRecord,
  canCreateOperationalRecord,
  canManageProject,
  canManageReceivable,
  canManageRiskRules,
  canReadDistrict,
} from '../domain';
import type { DemoSession } from '../types';
import { BusinessError } from './api';

function forbidden(): never {
  throw new BusinessError('FORBIDDEN', '无权操作其他区县或当前功能', 403);
}

export function assertCanRead(session: DemoSession, districtId: string): void {
  if (!canReadDistrict(session.role, session.districtId, districtId)) {
    forbidden();
  }
}

export function assertCanManageProject(session: DemoSession): void {
  if (!canManageProject(session.role)) forbidden();
}

export function assertCanManageReceivable(
  session: DemoSession,
  districtId: string,
): void {
  if (!canManageReceivable(session.role, session.districtId, districtId)) {
    forbidden();
  }
}

export function assertCanCreateOperational(
  session: DemoSession,
  districtId: string,
): void {
  if (
    !canCreateOperationalRecord(session.role, session.districtId, districtId)
  ) {
    forbidden();
  }
}

export function assertCanCorrectOperational(
  session: DemoSession,
  districtId: string,
): void {
  if (
    !canCorrectOperationalRecord(session.role, session.districtId, districtId)
  ) {
    forbidden();
  }
}

export function assertCanConfirm(session: DemoSession): void {
  if (!canConfirmReceivable(session.role)) forbidden();
}

export function assertCanManageRisk(session: DemoSession): void {
  if (!canManageRiskRules(session.role)) forbidden();
}
