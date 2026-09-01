'use client';

import { FormField } from '@/components/receivables/design-system';
import { Input } from '@/components/ui/input';

export function AttachmentField({
  label,
  required,
  hint,
  onChange,
}: {
  label: string;
  required?: boolean;
  hint: string;
  onChange: (file: File | null) => void;
}) {
  return (
    <FormField label={label} required={required} hint={hint}>
      <Input
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        required={required}
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
    </FormField>
  );
}
