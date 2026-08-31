'use client';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { EmptyState, PageHeading, SearchField } from './design-system';
import { ProjectRows, type OpenProject } from './project-primitives';
import {
  STAGES,
  projectMatchesStage,
  type ProjectModel,
  type ProjectStage,
} from '@/lib/project-lifecycle';
import type { BootstrapData } from '@/lib/types';

export function ProjectDirectory({
  data,
  models,
  archived = false,
  onOpen,
  onNew,
}: {
  data: BootstrapData;
  models: ProjectModel[];
  archived?: boolean;
  onOpen: OpenProject;
  onNew: () => void;
}) {
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState<ProjectStage | 'ALL'>('ALL');
  const [district, setDistrict] = useState('');
  const [page, setPage] = useState(0);
  const rows = models.filter(
    (m) =>
      Boolean(m.project.archivedAt) === archived &&
      (!district || m.project.districtId === district) &&
      (stage === 'ALL' || projectMatchesStage(m, stage)) &&
      [
        m.project.name,
        m.project.projectCode,
        m.project.contractCode,
        m.project.customerName,
      ]
        .join(' ')
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  );
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(rows.length / 20) - 1),
  );
  return (
    <>
      <PageHeading
        eyebrow="项目"
        title={archived ? '已结清与财务归档' : '找到项目，继续下一步'}
        description={
          archived
            ? '已形成应收结清后自动归档；新增节点或更正产生余额会恢复，不等同于合同结束。'
            : '合同、付款节点、催收、回款和风险，都在一个项目工作台中处理。'
        }
        actions={
          !archived && data.session.role === 'CITY_ADMIN' ? (
            <Button onClick={onNew}>
              <Plus />
              新建项目
            </Button>
          ) : undefined
        }
      />
      <section className="lc-section">
        <div className="lc-directory-toolbar">
          <SearchField
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(0);
            }}
            label="搜索项目、合同或客户"
            placeholder="项目名称 / 编码 / 合同 / 客户"
          />
          <NativeSelect
            aria-label="项目业务阶段"
            value={stage}
            onChange={(e) => {
              setStage(e.target.value as ProjectStage | 'ALL');
              setPage(0);
            }}
          >
            <NativeSelectOption value="ALL">全部阶段</NativeSelectOption>
            {Object.entries(STAGES).map(([key, label]) => (
              <NativeSelectOption key={key} value={key}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {data.session.role === 'CITY_ADMIN' && (
            <NativeSelect
              aria-label="项目区县"
              value={district}
              onChange={(e) => {
                setDistrict(e.target.value);
                setPage(0);
              }}
            >
              <NativeSelectOption value="">全部区县</NativeSelectOption>
              {data.districts.map((d) => (
                <NativeSelectOption key={d.id} value={d.id}>
                  {d.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
          <span className="lc-table-note">{rows.length} 个项目</span>
        </div>
        {rows.length ? (
          <ProjectRows
            models={rows.slice(currentPage * 20, (currentPage + 1) * 20)}
            onOpen={onOpen}
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
    </>
  );
}
