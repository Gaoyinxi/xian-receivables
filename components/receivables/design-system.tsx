'use client';

import * as React from 'react';
import { AlertTriangle, FileCheck2, Search } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { ReceivableRecord } from '@/lib/types';

type StatusTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

function StatusBadge({
  tone,
  children,
  dot = false,
  className,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      data-tone={tone}
      className={cn('app-status-badge', className)}
    >
      {dot ? <span aria-hidden="true" className="app-status-dot" /> : null}
      {children}
    </Badge>
  );
}

export function RiskBadge({ item }: { item: ReceivableRecord }) {
  if (item.confirmationStatus === 'DRAFT') {
    return <StatusBadge tone="neutral">待确认</StatusBadge>;
  }
  if (item.writeoffStatus === 'PAID') {
    return <StatusBadge tone="success">已结清</StatusBadge>;
  }
  const tone = (
    {
      NONE: 'neutral',
      BLUE: 'brand',
      YELLOW: 'warning',
      RED: 'danger',
    } satisfies Record<ReceivableRecord['riskLevel'], StatusTone>
  )[item.riskLevel];
  const label = item.overdueDays > 0 ? `逾期 ${item.overdueDays} 天` : '未到期';
  return (
    <StatusBadge tone={tone} dot>
      {label}
    </StatusBadge>
  );
}

export function WriteoffBadge({
  status,
}: {
  status: ReceivableRecord['writeoffStatus'];
}) {
  const labels = {
    UNPAID: '未回款',
    PARTIAL: '部分回款',
    PAID: '已结清',
  };
  const tones: Record<ReceivableRecord['writeoffStatus'], StatusTone> = {
    UNPAID: 'danger',
    PARTIAL: 'warning',
    PAID: 'success',
  };
  return <StatusBadge tone={tones[status]}>{labels[status]}</StatusBadge>;
}

export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <div className="app-section-kicker mb-2">{eyebrow}</div>
        <h1 className="text-[clamp(1.35rem,2vw,1.65rem)] font-semibold leading-tight tracking-[-0.025em] text-[var(--app-text-strong)]">
          {title}
        </h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn('app-search-control', className)}>
      <Search aria-hidden="true" className="app-search-icon" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="pl-8"
      />
    </div>
  );
}

export function DataPanel({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: {
  title?: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn('app-panel gap-0 py-0', className)}>
      {title ? (
        <CardHeader className="app-panel-header app-toolbar-header px-5 py-4">
          <CardTitle className="text-[15px] font-semibold text-[var(--app-text-strong)]">
            {title}
          </CardTitle>
          {description ? (
            <CardDescription className="text-xs">{description}</CardDescription>
          ) : null}
          {actions ? (
            <CardAction className="app-panel-actions">{actions}</CardAction>
          ) : null}
        </CardHeader>
      ) : null}
      <CardContent className={cn('px-0', contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}

export function SummaryTile({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: React.ReactNode;
  tone?: StatusTone;
}) {
  return (
    <div className="app-summary-tile" data-tone={tone}>
      <p className="app-summary-label">{label}</p>
      <p className="app-summary-value">{value}</p>
    </div>
  );
}

export function FormField({
  label,
  required,
  hint,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const generatedId = React.useId();
  const hintId = `${generatedId}-hint`;
  const childElement = React.isValidElement<{
    id?: string;
    'aria-describedby'?: string;
  }>(children)
    ? children
    : null;
  const isLabelable = childElement !== null && childElement.type !== 'div';
  const controlId = childElement?.props.id ?? generatedId;

  return (
    <div className={cn('space-y-1.5', className)}>
      {isLabelable ? (
        <Label htmlFor={controlId}>
          {label}
          {required ? (
            <span aria-hidden="true" className="text-destructive">
              *
            </span>
          ) : null}
        </Label>
      ) : (
        <span className="flex items-center gap-2 text-sm font-medium leading-none">
          {label}
          {required ? (
            <span aria-hidden="true" className="text-destructive">
              *
            </span>
          ) : null}
        </span>
      )}
      {isLabelable && childElement
        ? React.cloneElement(childElement, {
            id: controlId,
            'aria-describedby': hint
              ? [childElement.props['aria-describedby'], hintId]
                  .filter(Boolean)
                  .join(' ')
              : childElement.props['aria-describedby'],
          })
        : children}
      {hint ? (
        <p id={hintId} className="text-[11px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <Alert role="alert" data-tone="danger" className="app-callout">
      <AlertTriangle />
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  ) : null;
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Empty className="min-h-56">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileCheck2 />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
