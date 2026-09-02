import { ReceivablesApp } from '@/components/receivables-app';

export default function NewProjectPage() {
  return <ReceivablesApp initialRoute={{ view: 'projects', newProject: true }} />;
}
