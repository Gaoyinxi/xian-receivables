import { ReceivablesApp } from '@/components/receivables-app';

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <ReceivablesApp
      initialRoute={{ view: 'projects', projectId, section: 'overview' }}
    />
  );
}
