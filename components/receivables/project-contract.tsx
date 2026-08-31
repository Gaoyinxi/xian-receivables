'use client';
import { useState, type SubmitEvent } from 'react';
import { Paperclip, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorText, FormField } from './design-system';
import { apiRequest } from '@/lib/api-client';
import { canManageProject } from '@/lib/domain';
import { money, type ProjectModel } from '@/lib/project-lifecycle';
import type { DemoSession } from '@/lib/types';

export function ProjectContract({
  model,
  session,
  onDone,
}: {
  model: ProjectModel;
  session: DemoSession;
  onDone: (message: string) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const project = model.project;
  async function upload(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set('file', file);
      body.set('entityType', 'PROJECT');
      body.set('entityId', project.id);
      await apiRequest('/api/attachments', { method: 'POST', body });
      setFile(null);
      setInputKey((n) => n + 1);
      await onDone('合同附件已保存，项目附件列表已刷新');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '上传失败，请重试');
    } finally {
      setBusy(false);
    }
  }
  const details = [
    ['合同编码', project.contractCode],
    ['签订日期', project.contractDate],
    ['合同总额', money(project.contractAmountCents)],
    ['金额构成', project.amountComposition],
    ['客户', `${project.customerName} · ${project.customerType}`],
    ['客户联系人', project.customerContact],
    ['客户经理', project.accountManager],
    ['交付经理', project.deliveryManager],
    ['交付负责人', project.deliveryOwner],
    ['归属组织', `${project.districtName} / ${project.orgLevel4}`],
    ['业务状态', project.status],
    ['付费编码', project.billingCode || '未填写'],
    ['项目属性', project.tags.join('、') || '未设置'],
  ];
  return (
    <div className="lc-contract-grid">
      <section className="lc-section">
        <div className="lc-section-heading">
          <h2>合同与项目信息</h2>
        </div>
        <dl className="lc-contract-facts">
          {details.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="lc-section">
        <div className="lc-section-heading">
          <div>
            <h2>项目附件</h2>
            <p>合同、回款凭证和催缴附件按业务归属保留。</p>
          </div>
        </div>
        <ul className="lc-file-list">
          {model.attachments.map((attachment) => (
            <li key={attachment.id}>
              <a href={`/api/attachments/${attachment.id}`} download>
                <Paperclip aria-hidden="true" className="size-4" />
                <span>
                  {attachment.fileName}
                  <small>
                    {attachment.entityType === 'PROJECT'
                      ? '合同'
                      : attachment.entityType === 'RECEIPT'
                        ? '回款凭证'
                        : '催缴材料'}{' '}
                    · {(attachment.sizeBytes / 1024).toFixed(1)} KB
                  </small>
                </span>
              </a>
            </li>
          ))}
        </ul>
        {!model.attachments.length && (
          <p className="lc-empty">尚未上传附件。</p>
        )}
        {canManageProject(session.role) ? (
          <form onSubmit={upload} className="lc-contract-upload">
            <FormField
              label="上传合同附件"
              hint="PDF / JPG / PNG，单文件不超过 10MB。"
            >
              <Input
                key={inputKey}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                disabled={busy}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </FormField>
            <ErrorText error={error} />
            <Button
              type="submit"
              variant="outline"
              disabled={busy || !file}
              aria-busy={busy}
            >
              <UploadCloud />
              {busy ? '正在上传…' : '上传合同附件'}
            </Button>
          </form>
        ) : (
          <p className="lc-empty">
            合同附件由市级管理员上传；回款凭证和催缴材料在对应登记面板中上传。
          </p>
        )}
      </section>
    </div>
  );
}
