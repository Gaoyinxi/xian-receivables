import { ApiClientError } from '@/lib/api-client';
import type { CollectionAction, Role } from '@/lib/types';

export function formatYuan(cents: number): string {
  return `¥${(cents / 100).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

export function currentDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function centsForInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export const roleLabels: Record<Role, string> = {
  CITY_ADMIN: '市级管理员',
  DISTRICT_ADMIN: '区县管理员',
  DISTRICT_OPERATOR: '区县填报人',
};

export const actionLabels: Record<CollectionAction, string> = {
  WECHAT: '微信',
  MEETING: '面谈',
  COLLECTION_LETTER: '催收函',
  LAWYER_LETTER: '律师函',
  LITIGATION_LETTER: '诉讼函',
  LEADERSHIP: '领导介入',
};

export function requiresCollectionAttachment(
  action: CollectionAction,
): boolean {
  return (
    action === 'COLLECTION_LETTER' ||
    action === 'LAWYER_LETTER' ||
    action === 'LITIGATION_LETTER'
  );
}

export const baselineLabels: Record<string, string> = {
  SIGNING: '签约',
  INVOICE: '开票',
  PRE_ACCEPTANCE: '初验',
  FINAL_ACCEPTANCE: '终验',
  OTHER: '其他',
};

export const entityLabels: Record<string, string> = {
  PROJECT: '项目',
  RECEIVABLE: '应收',
  RECEIPT: '回款',
  COLLECTION: '催缴',
  ATTACHMENT: '附件',
  RISK_RULE: '风险规则',
  IMPORT_BATCH: '导入批次',
};

export const operationLabels: Record<string, string> = {
  CREATE: '新增',
  CONFIRM: '确认',
  UPDATE: '修改',
  UPLOAD: '上传',
  COMMIT: '提交',
  VOID_AND_CORRECT: '作废并更正',
};

export function describeError(error: unknown): string {
  if (error instanceof ApiClientError) {
    const details = Object.values(error.fieldErrors ?? {})
      .flat()
      .filter(Boolean)
      .slice(0, 3);
    return details.length
      ? `${error.message}：${Array.from(new Set(details)).join('；')}`
      : error.message;
  }
  return error instanceof Error ? error.message : '操作失败，请稍后重试';
}
