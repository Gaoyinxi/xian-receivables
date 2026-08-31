'use client';
import { PageHeading } from './design-system';
import { ProjectRows, type OpenProject } from './project-primitives';
import type { BootstrapData } from '@/lib/types';
import type { ProjectModel } from '@/lib/project-lifecycle';

export function GlobalRiskView({
  models,
  onOpen,
}: {
  models: ProjectModel[];
  onOpen: OpenProject;
}) {
  const rows = models
    .filter((m) => m.overdue > 0)
    .toSorted((a, b) => b.overdue - a.overdue);
  return (
    <>
      <PageHeading
        eyebrow="数据中心"
        title="风险项目总览"
        description="以项目聚合逾期余额。点击风险等级，进入对应项目查看原因、最近跟进与下一步。"
      />
      <section className="lc-section">
        {rows.length ? (
          <ProjectRows models={rows} onOpen={onOpen} />
        ) : (
          <p className="lc-empty">
            当前没有逾期项目。待确认应收不参与风险计算。
          </p>
        )}
      </section>
    </>
  );
}
export function AccountScopeView({ data }: { data: BootstrapData }) {
  return (
    <>
      <PageHeading
        eyebrow="系统管理"
        title="账号与权限"
        description="沿用服务端角色校验和区县隔离。此页说明权限，不更改任何账号配置。"
      />
      <section className="lc-section">
        <div className="lc-section-heading">
          <div>
            <h2>{data.session.displayName}</h2>
            <p>
              数据范围：{data.session.districtName || '全市'} ·{' '}
              {data.session.authMode === 'PASSWORD'
                ? '正式账号登录'
                : '演示身份'}
            </p>
          </div>
        </div>
        <dl className="lc-contract-facts">
          <div>
            <dt>市级管理员</dt>
            <dd>全部数据、建立项目、确认应收、规则设置及纠错处理。</dd>
          </div>
          <div>
            <dt>区县管理员</dt>
            <dd>本区数据、付款节点维护、回款与催缴作废更正。</dd>
          </div>
          <div>
            <dt>区县填报人</dt>
            <dd>本区数据、登记回款和催缴、上传对应附件。</dd>
          </div>
          <div>
            <dt>账号维护</dt>
            <dd>
              使用顶部账号菜单修改密码或退出。账号开通、停用和权限调整继续由本机管理员通过既有账号管理工具完成。
            </dd>
          </div>
        </dl>
      </section>
    </>
  );
}
