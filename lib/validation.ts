import { z } from 'zod';

import { isIsoDate, yuanToCents } from './domain';

const requiredText = (label: string) =>
  z
    .string({ message: `请填写${label}` })
    .trim()
    .min(1, `请填写${label}`);

const dateText = (label: string) =>
  requiredText(label).refine(isIsoDate, `${label}格式应为 YYYY-MM-DD`);

const moneyToCents = (label: string) =>
  z
    .union([z.string(), z.number()])
    .transform((value) => yuanToCents(value))
    .refine((value): value is number => value !== null, `${label}必须大于0且最多两位小数`);

export const roleSchema = z.enum([
  'CITY_ADMIN',
  'DISTRICT_ADMIN',
  'DISTRICT_OPERATOR',
]);

export const sessionSwitchSchema = z.object({
  role: roleSchema,
  districtCode: z.string().trim().optional().nullable(),
});

export const projectCreateSchema = z.object({
  name: requiredText('项目名称'),
  contractCode: requiredText('合同编码'),
  tags: z.array(z.enum(['数智签约', '信产签约', '权责项目', '确认欠费'])).default([]),
  districtCode: requiredText('归属单位（三级）'),
  orgLevel4: requiredText('归属单位（四级）'),
  customerName: requiredText('客户名称'),
  customerType: z.enum(['政府', '企业', '中小微'], {
    message: '请选择客户类型',
  }),
  customerContact: requiredText('客户对接人'),
  deliveryOwner: requiredText('项目交付负责人'),
  accountManager: requiredText('客户经理'),
  deliveryManager: requiredText('交付经理'),
  status: z.enum(['执行中', '验收中', '维保期', '已关闭'], {
    message: '请选择项目状态',
  }),
  contractDate: dateText('合同签订日期'),
  contractAmountYuan: moneyToCents('合同总金额'),
  amountComposition: z.enum(['标品', 'ICT（税率6%）', 'ICT（税率13%）'], {
    message: '请选择合同金额构成',
  }),
  billingCode: z.string().trim().optional().nullable(),
});

export const receivableCreateSchema = z.object({
  projectId: requiredText('项目'),
  sequenceNo: z.coerce.number().int().min(1, '节点序号必须大于0'),
  paymentType: z.enum(['预付款', '进度款', '初验款', '终验款', '质保金'], {
    message: '请选择款项类型',
  }),
  amountYuan: moneyToCents('节点金额'),
  paymentCondition: requiredText('付款条件'),
  baselineEvent: z.enum([
    'SIGNING',
    'INVOICE',
    'PRE_ACCEPTANCE',
    'FINAL_ACCEPTANCE',
    'OTHER',
  ]),
  baselineDate: dateText('基准日期'),
  termDays: z.coerce.number().int().min(0, '账期天数不能小于0').max(3650),
  acceptanceType: z.string().trim().optional().nullable(),
  acceptanceDate: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine((value) => !value || isIsoDate(value), '验收日期格式应为 YYYY-MM-DD'),
  invoiceStatus: z.string().trim().optional().nullable(),
  invoiceDeliveredDate: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine(
      (value) => !value || isIsoDate(value),
      '发票递交日期格式应为 YYYY-MM-DD',
    ),
  overdueReason: z.string().trim().optional().nullable(),
});

export const receiptCreateSchema = z.object({
  receivableId: requiredText('应收记录'),
  amountYuan: moneyToCents('实收金额'),
  receivedDate: dateText('实收日期'),
  note: z.string().trim().max(500).optional().nullable(),
  attachmentId: z.string().trim().optional().nullable(),
});

export const receiptCorrectSchema = receiptCreateSchema.extend({
  originalId: requiredText('原回款记录'),
  reason: requiredText('更正原因').min(2, '请具体说明更正原因'),
});

export const collectionCreateSchema = z.object({
  receivableId: requiredText('应收记录'),
  actionType: z.enum([
    'WECHAT',
    'MEETING',
    'COLLECTION_LETTER',
    'LAWYER_LETTER',
    'LITIGATION_LETTER',
    'LEADERSHIP',
  ]),
  actionDate: dateText('催缴日期'),
  note: z.string().trim().max(1000).optional().nullable(),
  attachmentId: z.string().trim().optional().nullable(),
});

export const collectionCorrectSchema = collectionCreateSchema.extend({
  originalId: requiredText('原催缴记录'),
  reason: requiredText('更正原因').min(2, '请具体说明更正原因'),
});

export const riskRulesSchema = z
  .object({
    blueMinDays: z.coerce.number().int().min(1),
    yellowMinDays: z.coerce.number().int().min(2),
    redMinDays: z.coerce.number().int().min(3),
    legalLevel5MinMonths: z.coerce.number().int().min(1),
    legalLevel4MinMonths: z.coerce.number().int().min(2),
    legalLevel3MinMonths: z.coerce.number().int().min(3),
    legalLevel2MinMonths: z.coerce.number().int().min(4),
    legalLevel1MinMonths: z.coerce.number().int().min(5),
    reason: requiredText('修改原因').min(2, '请具体说明修改原因'),
  })
  .refine(
    (value) =>
      value.blueMinDays < value.yellowMinDays &&
      value.yellowMinDays < value.redMinDays,
    {
      message: '逾期风险阈值必须按蓝、黄、红递增',
      path: ['yellowMinDays'],
    },
  )
  .refine(
    (value) =>
      value.legalLevel5MinMonths < value.legalLevel4MinMonths &&
      value.legalLevel4MinMonths < value.legalLevel3MinMonths &&
      value.legalLevel3MinMonths < value.legalLevel2MinMonths &&
      value.legalLevel2MinMonths < value.legalLevel1MinMonths,
    {
      message: '法律风险月份阈值必须依次递增',
      path: ['legalLevel4MinMonths'],
    },
  );

export const importPayloadSchema = z.object({
  kind: z.enum(['PROJECT', 'RECEIVABLE', 'RECEIPT']),
  fileName: requiredText('文件名'),
  rows: z.array(z.record(z.string(), z.unknown())).min(1, '文件中没有可导入数据').max(1000),
});

export const importCommitSchema = importPayloadSchema.extend({
  batchId: requiredText('导入批次'),
});
