import { ReceivablesApp } from '@/components/receivables-app';
import { parseWorkspaceLocation } from '@/lib/project-navigation';

export default async function ProjectSectionPage({
  params,
}: {
  params: Promise<{ projectId: string; section: string }>;
}) {
  const { projectId, section } = await params;
  const route = parseWorkspaceLocation(
    `/projects/${encodeURIComponent(projectId)}/${encodeURIComponent(section)}`,
  );
  return <ReceivablesApp initialRoute={route} />;
}
