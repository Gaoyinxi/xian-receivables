import * as React from 'react';
import { CircleDollarSign, ArrowRight, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { setCsrfToken } from '@/lib/api-client';
import { authService } from '@/services/auth';
import type { AuthState } from './auth-gate';

export function Login({
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
    setBusy(true);
    setError('');
    try {
      const result = await authService.login({
        username: form.get('username'),
        password: form.get('password'),
      });
      setCsrfToken(result.csrfToken);
      onSuccess(result);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : '登录失败，请稍后重试',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="app-loading-screen px-4 py-8">
      <section
        className="app-panel w-full max-w-md p-6 sm:p-8"
        aria-labelledby="login-title"
      >
        <div className="mb-8 flex items-center gap-3">
          <div className="app-brand-mark size-11">
            <CircleDollarSign aria-hidden="true" className="size-6" />
          </div>
          <div>
            <p className="font-semibold text-foreground">项目应收管理</p>
            <p className="text-xs tracking-widest text-muted-foreground">
              RECEIVABLES
            </p>
          </div>
        </div>
        <h1 id="login-title" className="text-2xl font-semibold tracking-tight">
          登录工作台
        </h1>
        <p className="mb-6 mt-2 text-sm leading-6 text-muted-foreground">
          使用管理员为你开通的账号，继续处理项目应收与回款。
        </p>
        <form className="space-y-4" onSubmit={submit} aria-busy={busy}>
          <div className="space-y-2">
            <label htmlFor="username" className="text-sm font-medium">
              账号
            </label>
            <Input
              id="username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              minLength={3}
              maxLength={64}
              className="h-11"
              disabled={busy}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'login-error' : undefined}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              密码
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              className="h-11"
              disabled={busy}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'login-error' : undefined}
            />
          </div>
          {error ? (
            <p
              id="login-error"
              role="alert"
              className="text-sm leading-6 text-destructive"
            >
              {error}
            </p>
          ) : null}
          <Button type="submit" className="h-11 w-full" disabled={busy}>
            {busy ? '正在登录…' : '登录'}
            <ArrowRight aria-hidden="true" />
          </Button>
        </form>
        <p className="mt-6 flex items-start gap-2 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
          <LockKeyhole className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          没有公开注册入口。忘记密码或需要开通账号，请联系本机管理员。
        </p>
      </section>
    </main>
  );
}
