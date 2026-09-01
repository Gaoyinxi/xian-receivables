'use client';

import { useEffect, useState } from 'react';
import { Search, FolderKanban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';
import { searchProjects } from '@/lib/project-search';
import type { ProjectRecord } from '@/lib/types';

export function ProjectSwitcher({
  projects,
  onOpen,
}: {
  projects: ProjectRecord[];
  onOpen: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const matches = searchProjects(projects, query);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        // Do not open a second modal over an in-progress financial operation.
        if (document.querySelector('[role="dialog"]') && !open) return;
        event.preventDefault();
        setOpen((value) => !value);
        setQuery('');
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [open]);
  return (
    <>
      <Button
        variant="outline"
        className="app-project-search"
        aria-label="查找项目"
        aria-haspopup="dialog"
        onClick={() => {
          setQuery('');
          setOpen(true);
        }}
      >
        <Search aria-hidden="true" />
        <span>查找项目</span>
        <kbd>⌘ / Ctrl K</kbd>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="app-project-picker">
          <DialogHeader>
            <DialogTitle>查找项目</DialogTitle>
            <DialogDescription>
              按名称、项目编码、合同或客户搜索，仅展示当前账号可见的数据。
            </DialogDescription>
          </DialogHeader>
          <Command shouldFilter={false}>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="搜索项目、合同或客户…"
              aria-label="搜索项目、合同或客户"
            />
            <CommandList aria-label="匹配项目">
              <CommandEmpty>没有匹配项目，请尝试其他关键词。</CommandEmpty>
              <CommandGroup
                heading={`${matches.length} 个结果${matches.length > 20 ? ' · 展示前 20 个，请输入更具体的关键词' : ''}`}
              >
                {matches.slice(0, 20).map((project) => (
                  <CommandItem
                    key={project.id}
                    value={project.id}
                    onSelect={() => {
                      setOpen(false);
                      onOpen(project.id);
                    }}
                  >
                    <FolderKanban aria-hidden="true" />
                    <div className="min-w-0">
                      <strong>{project.name}</strong>
                      <small>
                        {project.projectCode} · {project.districtName}
                        {project.archivedAt ? ' · 已归档' : ''}
                      </small>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
