'use client';
import { ArrowUpRight, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  STAGES,
  money,
  type ProjectModel,
  type ProjectStage,
} from '@/lib/project-lifecycle';
import type { ProjectSection } from '@/lib/project-navigation';

export type OpenProject = (
  projectId: string,
  section?: ProjectSection,
  nodeId?: string,
) => void;
export const RISK_LABELS = {
  NONE: '无逾期风险',
  BLUE: '蓝色风险',
  YELLOW: '黄色风险',
  RED: '红色风险',
};
export function StageBadge({ stage }: { stage: ProjectStage }) {
  return (
    <Badge variant="outline" className="lc-stage" data-stage={stage}>
      {STAGES[stage]}
    </Badge>
  );
}
export function ProjectRows({
  models,
  onOpen,
}: {
  models: ProjectModel[];
  onOpen: OpenProject;
}) {
  return (
    <Table aria-label="项目生命周期总览">
      <TableHeader>
        <TableRow className="app-table-head-row">
          <TableHead>项目 / 区县</TableHead>
          <TableHead>当前状态</TableHead>
          <TableHead className="text-right">待回款</TableHead>
          <TableHead>回款进度</TableHead>
          <TableHead>风险 / 下一步</TableHead>
          <TableHead>
            <span className="sr-only">打开项目</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {models.map((model) => (
          <TableRow key={model.project.id}>
            <TableCell>
              <button
                className="app-table-link app-data-title"
                onClick={() => onOpen(model.project.id)}
              >
                {model.project.name}
              </button>
              <p className="app-data-code">
                {model.project.projectCode} · {model.project.districtName}
              </p>
            </TableCell>
            <TableCell>
              <StageBadge stage={model.stage} />
              <p className="lc-table-note">
                {model.badges.join(' · ') ||
                  `业务状态：${model.project.status}`}
              </p>
            </TableCell>
            <TableCell className="text-right">
              <strong className="lc-money">{money(model.remaining)}</strong>
              {model.draft > 0 && (
                <p className="lc-table-note">另有待确认 {money(model.draft)}</p>
              )}
            </TableCell>
            <TableCell>
              <div className="lc-table-progress">
                <span>
                  {model.confirmed
                    ? `${Math.round((model.received / model.confirmed) * 100)}%`
                    : '—'}
                </span>
                <progress
                  className="app-progress-native"
                  aria-label={`${model.project.name}已确认应收回款比例`}
                  max={Math.max(model.confirmed, 1)}
                  value={model.received}
                />
              </div>
            </TableCell>
            <TableCell>
              <button
                className="lc-risk-link"
                data-risk={model.risk}
                onClick={() => onOpen(model.project.id, 'risk')}
              >
                {RISK_LABELS[model.risk]}
                <ArrowUpRight aria-hidden="true" className="size-3" />
              </button>
              <p className="lc-table-note">{model.next.label}</p>
            </TableCell>
            <TableCell>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpen(model.project.id)}
              >
                进入项目
                <ChevronRight aria-hidden="true" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
