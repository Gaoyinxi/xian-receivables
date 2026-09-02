'use client';
import { useState } from 'react';
import { FileSpreadsheet, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, SearchField } from './design-system';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { type OpenProject } from './project-primitives';
import { ProjectIndex } from './project-index';
import { type ProjectModel } from '@/lib/project-lifecycle';
import type { BootstrapData } from '@/lib/types';

type ProjectQuickFilter = 'all' | 'outstanding' | 'overdue' | 'upcoming';

export function ProjectDirectory({
  data,
  models,
  archived = false,
  onOpen,
  onNew,
  onImport,
  onArchiveChange,
  onAction,
}: {
  data: BootstrapData;
  models: ProjectModel[];
  archived?: boolean;
  onOpen: OpenProject;
  onNew: () => void;
  onImport: () => void;
  onArchiveChange: (archived: boolean) => void;
  onAction?: (model: ProjectModel) => void;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quickFilter, setQuickFilter] = useState<ProjectQuickFilter>('all');
  const [district, setDistrict] = useState('all');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('recent');
  const scopedModels = models.filter(
    (model) => Boolean(model.project.archivedAt) === archived,
  );
  const searchedRows = scopedModels.filter((m) =>
    [
      m.project.name,
      m.project.projectCode,
      m.project.contractCode,
      m.project.customerName,
      m.project.districtName,
      m.project.accountManager,
    ]
      .join(' ')
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );
  const rows = searchedRows
    .filter((model) => {
      if (district !== 'all' && model.project.districtName !== district)
        return false;
      if (category !== 'all' && !model.project.tags.includes(category))
        return false;
      if (quickFilter === 'outstanding') return model.remaining > 0;
      if (quickFilter === 'overdue') return model.overdue > 0;
      if (quickFilter === 'upcoming') return model.stage === 'DUE';
      return true;
    })
    .toSorted((a, b) =>
      sort === 'amount'
        ? b.remaining - a.remaining
        : sort === 'risk'
          ? b.overdue - a.overdue
          : b.lastActivity.localeCompare(a.lastActivity),
    );
  const districts = [
    ...new Set(scopedModels.map((model) => model.project.districtName)),
  ].sort();
  const categories = [
    ...new Set(scopedModels.flatMap((model) => model.project.tags)),
  ].sort();
  const summary = {
    all: scopedModels.length,
    outstanding: scopedModels.filter((model) => model.remaining > 0).length,
    overdue: scopedModels.filter((model) => model.overdue > 0).length,
    upcoming: scopedModels.filter((model) => model.stage === 'DUE').length,
    amount: scopedModels.reduce((total, model) => total + model.remaining, 0),
  };
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(rows.length / 20) - 1),
  );
  return (
    <section className="lc-project-directory">
      <header className="lc-approved-directory-head">
        <span>项目</span>
        <div className="lc-approved-title-row">
          <div>
            <h1>{archived ? '已归档项目' : '所有项目'}</h1>
          </div>
          {!archived && (
            <div className="lc-approved-head-actions">
              <Button variant="outline" onClick={onImport}>
                <FileSpreadsheet aria-hidden="true" />
                导入 Excel
              </Button>
              {data.session.role === 'CITY_ADMIN' && (
                <Button onClick={onNew}>
                  <Plus aria-hidden="true" />
                  新建项目
                </Button>
              )}
            </div>
          )}
        </div>
      </header>
      <section className="lc-project-summary-filters" aria-label="项目范围">
        {(
          [
            ['all', '全部', summary.all],
            ['outstanding', '待收', summary.outstanding],
            ['overdue', '逾期', summary.overdue],
            ['upcoming', '近期到期', summary.upcoming],
          ] as const
        ).map(([value, label, count]) => (
          <button
            type="button"
            className="lc-project-summary-filter"
            data-active={quickFilter === value}
            data-filter={value}
            aria-pressed={quickFilter === value}
            key={value}
            onClick={() => {
              setQuickFilter(value);
              setSelectedId(null);
              setPage(0);
            }}
          >
            {label} <b>{count}</b>
          </button>
        ))}
        <span className="lc-project-summary-amount">
          待收金额{' '}
          <strong>
            {new Intl.NumberFormat('zh-CN', {
              style: 'currency',
              currency: 'CNY',
              maximumFractionDigits: 0,
            }).format(summary.amount / 100)}
          </strong>
        </span>
        <button
          type="button"
          className="lc-project-summary-filter"
          data-active={archived}
          onClick={() => {
            setSelectedId(null);
            onArchiveChange(!archived);
          }}
        >
          {archived
            ? '返回进行中'
            : `已结清 ${models.filter((model) => model.project.archivedAt).length}`}
        </button>
      </section>
      <div className="lc-directory-toolbar">
        <SearchField
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(0);
            setSelectedId(null);
          }}
          label="搜索项目、合同、区域或负责人"
          placeholder="项目 / 合同编码 / 区域 / 负责人"
        />
        <div className="lc-approved-view-tabs" aria-label="应收状态">
          <button
            type="button"
            data-active={quickFilter === 'all'}
            onClick={() => setQuickFilter('all')}
          >
            全部
          </button>
          <button
            type="button"
            data-active={quickFilter === 'outstanding'}
            onClick={() => setQuickFilter('outstanding')}
          >
            待收
          </button>
          <button
            type="button"
            data-active={quickFilter === 'overdue'}
            onClick={() => setQuickFilter('overdue')}
          >
            逾期
          </button>
        </div>
        <div className="lc-approved-selects">
          <NativeSelect
            aria-label="全部分类"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <NativeSelectOption value="all">全部分类</NativeSelectOption>
            {categories.map((tag) => (
              <NativeSelectOption key={tag} value={tag}>
                {tag}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="全部区域"
            value={district}
            onChange={(event) => setDistrict(event.target.value)}
          >
            <NativeSelectOption value="all">全部区域</NativeSelectOption>
            {districts.map((name) => (
              <NativeSelectOption key={name} value={name}>
                {name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="排序"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <NativeSelectOption value="recent">最近处理</NativeSelectOption>
            <NativeSelectOption value="amount">待收金额</NativeSelectOption>
            <NativeSelectOption value="risk">风险优先</NativeSelectOption>
          </NativeSelect>
          <span className="lc-table-note">{rows.length} 条</span>
        </div>
      </div>
      {rows.length ? (
        <ProjectIndex
          models={rows.slice(currentPage * 20, (currentPage + 1) * 20)}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onOpen={onOpen}
          onAction={onAction}
        />
      ) : (
        <EmptyState
          title="暂无符合条件的项目"
          description="可清除筛选条件，或在进行中项目中新建项目。"
        />
      )}
      {rows.length > 20 && (
        <div className="lc-pagination">
          <Button
            variant="outline"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            上一页
          </Button>
          <span>
            {currentPage + 1} / {Math.ceil(rows.length / 20)}
          </span>
          <Button
            variant="outline"
            disabled={(currentPage + 1) * 20 >= rows.length}
            onClick={() => setPage(currentPage + 1)}
          >
            下一页
          </Button>
        </div>
      )}
    </section>
  );
}
