import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import * as XLSX from 'xlsx';

for (const [name, count] of [
  ['项目主表', 16],
  ['付款节点', 8],
  ['回款流水', 4],
] as const) {
  void test(`${name}真实xlsx：表头、填写说明、冻结首行与千行校验`, () => {
    const path = join(
      process.cwd(),
      'public/templates',
      `${name}导入模板.xlsx`,
    );
    const workbook = XLSX.read(readFileSync(path), { type: 'buffer' });
    assert.deepEqual(workbook.SheetNames, ['导入数据', '填写说明']);
    const headers = XLSX.utils.sheet_to_json<string[]>(
      workbook.Sheets['导入数据'],
      { header: 1 },
    )[0];
    assert.equal(headers.length, count);
    const xml = execFileSync(
      'unzip',
      ['-p', path, 'xl/worksheets/sheet1.xml'],
      { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
    );
    assert.match(xml, /state="frozen"/);
    assert.match(xml, /topLeftCell="A2"/);
    assert.match(xml, /sqref="[A-Z]+2:[A-Z]+1001"/);
    assert.match(xml, /showErrorMessage="1"/);
    if (name !== '回款流水') assert.match(xml, /type="list"/);
  });
}
