import * as React from 'react';
import { ShieldCheck } from 'lucide-react';
import { ReceivablesApp } from '@/components/receivables-app';
import { AccountActionsContext } from '@/components/receivables/account-context';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { setCsrfToken } from '@/lib/api-client';
import { authService, type AuthState } from '@/services/auth';
import { Login } from './login';
import { PasswordForm } from './password-form';

export type { AuthState } from '@/services/auth';

export function AuthGate() {
  const [auth, setAuth] = React.useState<AuthState | null>(null);
  const [error, setError] = React.useState('');
  const [accountOpen, setAccountOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const revision = React.useRef(0);
  const accept = React.useCallback((state: AuthState) => {
    revision.current++;
    setCsrfToken(state.csrfToken);
    setAuth(state);
    setError('');
  }, []);
  const refresh = React.useCallback(async () => {
    const current = ++revision.current;
    try {
      const state = await authService.session();
      if (revision.current === current) accept(state);
    } catch (failure) {
      if (revision.current === current)
        setError(failure instanceof Error ? failure.message : '连接服务器失败');
    }
  }, [accept]);
  React.useEffect(() => {
    let active = true;
    const current = ++revision.current;
    void authService
      .session()
      .then((state) => {
        if (active && current === revision.current) accept(state);
      })
      .catch((failure: unknown) => {
        if (active && current === revision.current)
          setError(
            failure instanceof Error ? failure.message : '连接服务器失败',
          );
      });
    const expired = () => {
      setCsrfToken(null);
      setAuth(null);
      setError('');
      setAccountOpen(false);
      void refresh();
    };
    window.addEventListener('receivables:authentication-required', expired);
    return () => {
      active = false;
      window.removeEventListener(
        'receivables:authentication-required',
        expired,
      );
    };
  }, [accept, refresh]);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      await authService.logout();
      accept({ session: null, csrfToken: null });
      setAccountOpen(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '退出失败，请重试');
      setAccountOpen(true);
    } finally {
      setBusy(false);
    }
  }
  if (!auth)
    return (
      <main className="app-loading-screen px-4">
        <section
          className="app-panel w-full max-w-md p-6"
          aria-live="polite"
          aria-busy={!error}
        >
          <h1 className="text-lg font-semibold">
            {error ? '暂时无法连接工作台' : '正在连接工作台'}
          </h1>
          <p
            role={error ? 'alert' : 'status'}
            className="my-3 text-sm leading-6 text-muted-foreground"
          >
            {error || '正在校验登录状态，业务数据保存在服务器。'}
          </p>
          {error ? (
            <Button onClick={() => void refresh()}>重新连接</Button>
          ) : null}
        </section>
      </main>
    );
  if (!auth.session) return <Login onSuccess={accept} />;
  if (auth.session.mustChangePassword)
    return (
      <main className="app-loading-screen px-4 py-8">
        <section
          className="app-panel w-full max-w-md p-6 sm:p-8"
          aria-labelledby="first-password-title"
        >
          <ShieldCheck
            aria-hidden="true"
            className="mb-4 size-7 text-primary"
          />
          <h1 id="first-password-title" className="text-xl font-semibold">
            先设置你的专用密码
          </h1>
          <p className="mb-6 mt-2 text-sm leading-6 text-muted-foreground">
            你好，{auth.session.displayName}
            。初始密码仅用于交接，修改后才能访问业务台账。
          </p>
          <PasswordForm onSuccess={accept} />
          <Button
            className="mt-3 w-full"
            variant="ghost"
            disabled={busy}
            onClick={() => void signOut()}
          >
            退出登录
          </Button>
        </section>
      </main>
    );
  return (
    <AccountActionsContext.Provider
      value={{
        onAccount: () => setAccountOpen(true),
        onSignOut: () => void signOut(),
        busy,
      }}
    >
      <ReceivablesApp key={auth.session.id} />
      <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>账号安全</DialogTitle>
            <DialogDescription>
              当前账号：{auth.session.username}
              。账号和区县权限由管理员统一配置。
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <PasswordForm
            onSuccess={(state) => {
              accept(state);
              setAccountOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </AccountActionsContext.Provider>
  );
}
