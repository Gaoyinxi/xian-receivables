'use client';
import { useEffect, useState } from 'react';
import { PageHeading } from './design-system';
import { ProjectRows, type OpenProject } from './project-primitives';
import { RiskView } from './views/risk-view';
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
export function AccountScopeView({
  data,
  onDone,
}: {
  data: BootstrapData;
  onDone: (message: string) => Promise<void>;
}) {
  const [density, setDensity] = useState<'comfortable' | 'compact'>(
    'comfortable',
  );
  const [motion, setMotion] = useState<'full' | 'reduced'>('full');
  const [preferencesReady, setPreferencesReady] = useState(false);
  useEffect(() => {
    const savedDensity = localStorage.getItem('receivables-density');
    const savedMotion = localStorage.getItem('receivables-motion');
    queueMicrotask(() => {
      if (savedDensity === 'compact') setDensity('compact');
      if (savedMotion === 'reduced') setMotion('reduced');
      setPreferencesReady(true);
    });
  }, []);
  useEffect(() => {
    if (!preferencesReady) return;
    document.documentElement.dataset.density = density;
    document.documentElement.dataset.motion = motion;
    localStorage.setItem('receivables-density', density);
    localStorage.setItem('receivables-motion', motion);
  }, [density, motion, preferencesReady]);
  return (
    <>
      <PageHeading
        eyebrow="设置"
        title="基础设置"
        description="查看当前账号和数据范围；日常业务请直接在项目中处理。"
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
            <dd>全部数据、建立项目、确认应收及纠错处理。</dd>
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
        <section
          className="lc-preference-settings"
          aria-labelledby="interface-preferences"
        >
          <div>
            <h2 id="interface-preferences">界面偏好</h2>
            <p>仅保存在当前浏览器，不会改变业务数据。</p>
          </div>
          <div className="lc-preference-row">
            <span>
              <strong>信息密度</strong>
              <small>调整项目列表与任务节点的纵向间距。</small>
            </span>
            <fieldset className="lc-segmented-control" aria-label="信息密度">
              <button
                type="button"
                aria-pressed={density === 'comfortable'}
                onClick={() => setDensity('comfortable')}
              >
                舒适
              </button>
              <button
                type="button"
                aria-pressed={density === 'compact'}
                onClick={() => setDensity('compact')}
              >
                紧凑
              </button>
            </fieldset>
          </div>
          <div className="lc-preference-row">
            <span>
              <strong>动效强度</strong>
              <small>保留页面连续性，或关闭非必要的入场动画。</small>
            </span>
            <fieldset className="lc-segmented-control" aria-label="动效强度">
              <button
                type="button"
                aria-pressed={motion === 'full'}
                onClick={() => setMotion('full')}
              >
                标准
              </button>
              <button
                type="button"
                aria-pressed={motion === 'reduced'}
                onClick={() => setMotion('reduced')}
              >
                减少
              </button>
            </fieldset>
          </div>
        </section>
        {data.session.role === 'CITY_ADMIN' && (
          <details className="lc-disclosure lc-settings-advanced">
            <summary>管理员设置 · 风险阈值</summary>
            <p>仅在需要调整全市逾期口径时打开；保存后会保留审计记录。</p>
            <RiskView data={data} onDone={onDone} embedded />
          </details>
        )}
      </section>
    </>
  );
}
