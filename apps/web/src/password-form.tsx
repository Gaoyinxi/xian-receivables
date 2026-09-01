import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { setCsrfToken } from '@/lib/api-client';
import { authService } from '@/services/auth';
import type { AuthState } from './auth-gate';

export function PasswordForm({
  onSuccess,
}: {
  onSuccess: (state: AuthState) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const newPassword = form.get('newPassword');
    if (typeof newPassword !== 'string') {
      setError('请输入新密码');
      return;
    }
    if (newPassword !== form.get('confirmation')) {
      setError('两次输入的新密码不一致');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await authService.password({
        currentPassword: form.get('currentPassword'),
        newPassword,
      });
      setCsrfToken(result.csrfToken);
      onSuccess(result);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '密码修改失败');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4" aria-busy={busy}>
      {[
        {
          id: 'currentPassword',
          label: '当前密码',
          complete: 'current-password',
          minimum: 1,
        },
        {
          id: 'newPassword',
          label: '新密码',
          complete: 'new-password',
          minimum: 12,
        },
        {
          id: 'confirmation',
          label: '再次输入新密码',
          complete: 'new-password',
          minimum: 12,
        },
      ].map((field) => (
        <div key={field.id} className="space-y-2">
          <label className="text-sm font-medium" htmlFor={field.id}>
            {field.label}
          </label>
          <Input
            id={field.id}
            name={field.id}
            type="password"
            autoComplete={field.complete}
            required
            minLength={field.minimum}
            maxLength={128}
            disabled={busy}
            className="h-11"
            aria-describedby="password-hint"
          />
        </div>
      ))}
      <p id="password-hint" className="text-xs leading-5 text-muted-foreground">
        使用 12–128 个字符的独立长密码。修改成功后，其他设备上的登录会话将失效。
      </p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="h-11 w-full" disabled={busy}>
        {busy ? '正在更新…' : '更新密码并继续'}
      </Button>
    </form>
  );
}
