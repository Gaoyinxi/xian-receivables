import * as XLSX from 'xlsx';
import { BusinessError } from './api';
import type { ImportKind } from '../types';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_ROWS = 1000;

function normalizeHeader(value: unknown): string {
  const text =
    typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : '';
  return text
    .trim()
    .replaceAll(/\s+/g, '');
}

function detectKind(headers: string[]): ImportKind {
  const set = new Set(headers.map(normalizeHeader));
  if (set.has('项目名称') && set.has('合同编码')) return 'PROJECT';
  if (set.has('项目编码') && set.has('节点序号') && set.has('款项类型'))
    return 'RECEIVABLE';
  if (set.has('应收编号') && set.has('实收金额') && set.has('实收日期'))
    return 'RECEIPT';
  throw new BusinessError(
    'IMPORT_TEMPLATE_UNKNOWN',
    '无法识别导入模板，请使用项目主表、付款节点或回款流水模板',
  );
}

function validateFile(file: File) {
  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xls'))
    throw new BusinessError(
      'IMPORT_FILE_TYPE',
      '请上传 Excel 文件（.xlsx 或 .xls）',
      415,
    );
  if (file.size <= 0 || file.size > MAX_FILE_SIZE)
    throw new BusinessError('FILE_TOO_LARGE', 'Excel 文件不能超过 10MB', 413);
}

export async function parseImportFile(
  file: File,
  requestedKind?: ImportKind,
): Promise<{
  kind: ImportKind;
  fileName: string;
  rows: Array<Record<string, unknown>>;
}> {
  validateFile(file);
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), {
      type: 'array',
      cellDates: true,
    });
  } catch {
    throw new BusinessError(
      'IMPORT_FILE_INVALID',
      'Excel 文件无法解析，请确认文件未损坏',
      422,
    );
  }
  const sheetName = workbook.Sheets['导入数据']
    ? '导入数据'
    : workbook.SheetNames[0];
  if (!sheetName) throw new BusinessError('IMPORT_FILE_EMPTY', 'Excel 文件没有工作表');
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  });
  const headers = matrix[0]?.map(normalizeHeader) ?? [];
  const kind = detectKind(headers);
  if (requestedKind && requestedKind !== kind)
    throw new BusinessError(
      'IMPORT_KIND_MISMATCH',
      `文件实际为${kind === 'PROJECT' ? '项目主表' : kind === 'RECEIVABLE' ? '付款节点' : '回款流水'}，已自动切换导入类型`,
    );
  const rows = XLSX.utils
    .sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: false,
      dateNF: 'yyyy-mm-dd',
    })
    .filter((row) =>
      Object.values(row).some((value) => String(value).trim() !== ''),
    );
  if (!rows.length)
    throw new BusinessError('IMPORT_FILE_EMPTY', '模板中没有可导入数据');
  if (rows.length > MAX_ROWS)
    throw new BusinessError('IMPORT_TOO_MANY_ROWS', '单次最多导入 1000 行数据');
  return { kind, fileName: file.name, rows };
}
