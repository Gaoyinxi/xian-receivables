'use client';
import { importService, type ImportPreview } from '@/services/operations';

import * as React from 'react';
import {
  Check,
  ArrowLeft,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  UploadCloud,
} from 'lucide-react';
import {
  DataPanel,
  ErrorText,
  PageHeading,
  SummaryTile,
} from '@/components/receivables/design-system';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { BootstrapData, ImportKind, RowError } from '@/lib/types';

export function ImportView({
  data,
  onDone,
  onBack,
}: {
  data: BootstrapData;
  onDone: (message: string) => Promise<void>;
  onBack?: () => void;
}) {
  const [kind, setKind] = React.useState<ImportKind>(
    data.session.role === 'CITY_ADMIN'
      ? 'PROJECT'
      : data.session.role === 'DISTRICT_ADMIN'
        ? 'RECEIVABLE'
        : 'RECEIPT',
  );
  const [report, setReport] = React.useState<{
    fileName: string;
    committedRows: number;
    rowErrors: RowError[];
  } | null>(null);
  const [rows, setRows] = React.useState<Array<Record<string, unknown>>>([]);
  const [preview, setPreview] = React.useState<ImportPreview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const uploadInputId = React.useId();
  const templates = [
    {
      kind: 'PROJECT' as const,
      title: '项目主表',
      fields: '16 个项目、组织、客户和合同字段',
      file: '/templates/项目主表导入模板.xlsx',
      allowed: data.session.role === 'CITY_ADMIN',
    },
    {
      kind: 'RECEIVABLE' as const,
      title: '付款节点',
      fields: '8 个付款节点与账期字段',
      file: '/templates/付款节点导入模板.xlsx',
      allowed: data.session.role !== 'DISTRICT_OPERATOR',
    },
    {
      kind: 'RECEIPT' as const,
      title: '回款流水',
      fields: '应收编号、金额、日期和备注',
      file: '/templates/回款流水导入模板.xlsx',
      allowed: true,
    },
  ];

  async function chooseFile(file: File | undefined) {
    if (!file || busy) return;
    setError(null);
    setPreview(null);
    setReport(null);
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setError('请使用标准模板上传 .xlsx 文件');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Excel 文件不能超过 10MB，请拆分后导入');
      return;
    }
    setBusy(true);
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer(), {
        type: 'array',
        cellDates: true,
      });
      const sheet =
        workbook.Sheets['导入数据'] || workbook.Sheets[workbook.SheetNames[0]];
      const parsed = XLSX.utils
        .sheet_to_json<Record<string, unknown>>(sheet, {
          defval: '',
          raw: false,
          dateNF: 'yyyy-mm-dd',
        })
        .filter((row) =>
          Object.values(row).some((value) => String(value).trim() !== ''),
        );
      if (!parsed.length) throw new Error('模板中没有可导入数据');
      const result = await importService.preview({
        kind,
        fileName: file.name,
        rows: parsed,
      });
      setRows(parsed);
      setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '文件解析失败');
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!preview || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await importService.commit({
        batchId: preview.batchId,
        kind,
        fileName: preview.fileName,
        rows,
      });
      setReport({ fileName: preview.fileName, ...result });
      setPreview(null);
      setRows([]);
      await onDone(
        `成功导入 ${result.committedRows} 行${
          result.rowErrors.length
            ? `，另有 ${result.rowErrors.length} 行未提交`
            : ''
        }`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败');
    } finally {
      setBusy(false);
    }
  }

  function downloadErrors() {
    const source = preview ?? report;
    if (!source?.rowErrors.length) return;
    const quote = (value: string | number) => {
      const text = String(value);
      const safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const csv = [
      ['行号', '错误码', '错误说明', '相关字段'].map(quote).join(','),
      ...source.rowErrors.map((item) =>
        [item.row, item.code, item.message, item.fields?.join('、') || '']
          .map(quote)
          .join(','),
      ),
    ].join('\r\n');
    const url = URL.createObjectURL(
      new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${source.fileName.replace(/\.xlsx$/i, '')}-错误明细.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeading
        eyebrow="项目"
        title="导入项目数据"
        description="上传后先预览并逐行校验；重复数据不会覆盖历史记录。"
        actions={
          onBack ? (
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft aria-hidden="true" />
              返回项目
            </Button>
          ) : undefined
        }
      />
      <div className="grid gap-3 md:grid-cols-3">
        {templates.map((template) => (
          <Card
            key={template.kind}
            className="app-panel app-template-card"
            data-selected={kind === template.kind}
            data-disabled={!template.allowed}
          >
            <CardHeader>
              <div className="app-template-icon mb-2">
                <FileSpreadsheet className="size-5" />
              </div>
              <CardTitle>{template.title}</CardTitle>
              <CardDescription>{template.fields}</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button
                variant="outline"
                nativeButton={false}
                render={
                  <a
                    href={template.file}
                    download
                    aria-label={`下载${template.title}导入模板`}
                  >
                    <Download /> 下载
                  </a>
                }
              />
              <Button
                variant={kind === template.kind ? 'default' : 'secondary'}
                disabled={busy || !template.allowed}
                aria-pressed={kind === template.kind}
                onClick={() => {
                  setKind(template.kind);
                  setPreview(null);
                  setReport(null);
                  setRows([]);
                  setError(null);
                }}
              >
                {template.allowed ? '选择导入' : '当前身份不可导入'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <DataPanel
        className="mt-4"
        title="上传并预览"
        description={`当前类型：${templates.find((item) => item.kind === kind)?.title}`}
        contentClassName="space-y-4 px-5 py-5"
      >
        <label
          htmlFor={uploadInputId}
          className="app-upload-zone"
          data-busy={busy}
        >
          {busy ? (
            <LoaderCircle className="mb-2 size-6 animate-spin text-[var(--app-brand)]" />
          ) : (
            <UploadCloud className="mb-2 size-7 text-[var(--app-brand)]" />
          )}
          <span className="text-sm font-medium text-[var(--app-text-strong)]">
            选择填写完成的 .xlsx 文件
          </span>
          <span className="mt-1 text-xs text-muted-foreground">
            单次最多 1000 行
          </span>
          <input
            id={uploadInputId}
            type="file"
            accept=".xlsx"
            className="sr-only"
            disabled={busy}
            onChange={(event) => void chooseFile(event.target.files?.[0])}
          />
        </label>
        <ErrorText error={error} />
        {report && (
          <section
            className="app-callout"
            data-tone={report.rowErrors.length ? 'warning' : 'success'}
            aria-label="导入结果"
          >
            <h2>
              已导入 {report.committedRows} 行
              {report.rowErrors.length
                ? `，${report.rowErrors.length} 行未提交`
                : ''}
            </h2>
            <p className="text-sm mt-2">
              已成功的数据不会重复提交。
              {report.rowErrors.length
                ? '请下载错误明细，修正未提交的数据后重新上传。'
                : '可返回项目继续办理，或选择下一份文件。'}
            </p>
            {report.rowErrors.length > 0 && (
              <Button
                variant="outline"
                className="mt-3"
                onClick={downloadErrors}
              >
                <Download />
                下载未提交行错误
              </Button>
            )}
          </section>
        )}
        {preview ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryTile label="总行数" value={preview.totalRows} />
              <SummaryTile
                label="有效行"
                value={preview.validRows.length}
                tone="success"
              />
              <SummaryTile
                label="错误行"
                value={preview.rowErrors.length}
                tone="danger"
              />
            </div>
            {preview.rowErrors.length ? (
              <div className="max-h-56 overflow-auto rounded-lg border">
                <Table aria-label="导入错误明细">
                  <TableHeader>
                    <TableRow className="app-table-head-row">
                      <TableHead>行号</TableHead>
                      <TableHead>错误</TableHead>
                      <TableHead>字段</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rowErrors.map((item) => (
                      <TableRow key={`${item.row}-${item.code}`}>
                        <TableCell>{item.row}</TableCell>
                        <TableCell className="text-[var(--app-negative)]">
                          {item.message}
                        </TableCell>
                        <TableCell>{item.fields?.join('、') || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void commit()}
                disabled={busy || preview.validRows.length === 0}
                aria-busy={busy}
              >
                {busy ? <LoaderCircle className="animate-spin" /> : <Check />}
                提交 {preview.validRows.length} 行有效数据
              </Button>
              {preview.rowErrors.length ? (
                <Button variant="outline" onClick={downloadErrors}>
                  <Download /> 下载错误明细
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </DataPanel>
    </>
  );
}
