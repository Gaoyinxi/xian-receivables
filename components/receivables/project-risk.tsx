'use client';
import { Button } from '@/components/ui/button';
import { RiskBadge } from './design-system';
import { COLLECTION_LABELS } from '@/lib/project-activity';
import { canCreateOperationalRecord } from '@/lib/domain';
import {
  FOLLOWUP_DAYS,
  followupGap,
  money,
  type ProjectModel,
} from '@/lib/project-lifecycle';
import type { BootstrapData, CollectionAction } from '@/lib/types';

export function ProjectRisk({
  model,
  data,
  today,
  onCollection,
}: {
  model: ProjectModel;
  data: BootstrapData;
  today: string;
  onCollection: (id: string, action?: CollectionAction) => void;
}) {
  return (
    <section className="lc-section">
      <div className="lc-section-heading">
        <div>
          <h2>风险为什么发生</h2>
          <p>
            依据已确认未结清应收及现行规则计算；催缴作废后不再作为法律风险基准。
          </p>
        </div>
      </div>
      <div className="lc-risk-rule-note">
        当前逾期阈值：蓝色 ≥ {data.riskRules.blueMinDays} 天 · 黄色 ≥{' '}
        {data.riskRules.yellowMinDays} 天 · 红色 ≥ {data.riskRules.redMinDays}{' '}
        天。{FOLLOWUP_DAYS} 天无记录仅为工作提醒，不改动风险规则。
      </div>
      {!model.open.length && (
        <p className="lc-empty">
          没有已确认且未结清的应收，当前无逾期风险。待确认节点不参与风险计算。
        </p>
      )}
      {model.open.map((node) => {
        const events = model.collections.filter(
          (c) => c.receivableId === node.id && c.status === 'VALID',
        );
        const canOperate = canCreateOperationalRecord(
          data.session.role,
          data.session.districtId,
          node.districtId,
        );
        return (
          <article
            key={node.id}
            className="lc-risk-explanation"
            data-risk={node.riskLevel}
          >
            <div className="lc-section-heading">
              <h3>
                第 {node.sequenceNo} 节点 · {node.paymentType}
              </h3>
              <RiskBadge item={node} />
            </div>
            <dl className="lc-risk-facts">
              <div>
                <dt>判断依据</dt>
                <dd>
                  {node.overdueDays > 0
                    ? `付款日 ${node.dueDate} 已过 ${node.overdueDays} 天；余额尚未收回。`
                    : `付款日 ${node.dueDate}，尚未逾期。`}
                </dd>
              </div>
              <div>
                <dt>剩余金额</dt>
                <dd>{money(node.remainingAmountCents)}</dd>
              </div>
              <div>
                <dt>最近有效跟进</dt>
                <dd>
                  {node.latestCollectionDate
                    ? `${node.latestCollectionDate}，距今 ${followupGap(node, today)} 天`
                    : node.overdueDays > 0
                      ? `暂无有效记录；自逾期基准起 ${followupGap(node, today)} 天`
                      : '暂无有效记录'}
                </dd>
              </div>
              <div>
                <dt>已发生动作</dt>
                <dd>
                  {events.length
                    ? events
                        .toSorted((a, b) =>
                          b.actionDate.localeCompare(a.actionDate),
                        )
                        .map(
                          (c) =>
                            `${c.actionDate} ${COLLECTION_LABELS[c.actionType]}`,
                        )
                        .join('；')
                    : '尚无有效催收动作'}
                </dd>
              </div>
              <div>
                <dt>法律风险提示</dt>
                <dd>
                  {node.legalRiskLevel
                    ? `${node.legalRiskLevel} 级；基准 ${node.latestCollectionDate ?? node.dueDate}，按现行整月阈值映射。`
                    : '暂无法律风险分级'}
                  <span className="lc-table-note">
                    此项为系统规则提示，不是法律意见。
                  </span>
                </dd>
              </div>
              <div>
                <dt>下一步</dt>
                <dd>
                  {node.overdueDays > 0
                    ? '联系客户核实付款安排并登记跟进；资金实际到账后登记回款。'
                    : '关注约定付款日；实际到账后登记回款。'}
                  {node.overdueReason && ` 已登记原因：${node.overdueReason}`}
                </dd>
              </div>
            </dl>
            {canOperate && (
              <div className="lc-inline-actions">
                <Button onClick={() => onCollection(node.id)}>登记催收</Button>
                <Button
                  variant="outline"
                  onClick={() => onCollection(node.id, 'COLLECTION_LETTER')}
                >
                  上传催收函
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => onCollection(node.id, 'LEADERSHIP')}
                >
                  领导介入
                </Button>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
