import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import { parseImportFile } from '../lib/server/import-file';

function excelFile(headers: string[], row: Record<string, unknown>, name = '导入.xlsx') {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet([row], { header: headers });
  XLSX.utils.book_append_sheet(workbook, sheet, '导入数据');
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return new File([bytes], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

void test('真实 Excel 文件会由服务端解析并自动识别模板类型', async () => {
  const file = excelFile(
    ['应收编号', '实收金额', '实收日期', '备注'],
    {
      应收编号: 'YS-2026-0001',
      实收金额: '1200.00',
      实收日期: '2026-09-01',
      备注: '阶段款到账',
    },
  );
  const parsed = await parseImportFile(file);
  assert.equal(parsed.kind, 'RECEIPT');
  assert.equal(parsed.fileName, '导入.xlsx');
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0]?.['应收编号'], 'YS-2026-0001');
});

void test('未知 Excel 表头会被拒绝而不是写入业务数据', async () => {
  const file = excelFile(['随便一列'], { 随便一列: '内容' }, '未知.xlsx');
  await assert.rejects(
    () => parseImportFile(file),
    (error: unknown) =>
      error instanceof Error &&
      'code' in error &&
      error.code === 'IMPORT_TEMPLATE_UNKNOWN',
  );
});
