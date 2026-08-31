'use client';

import * as React from 'react';
import { LogOut, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const AccountActionsContext = React.createContext<{
  onAccount: () => void;
  onSignOut: () => void;
  busy: boolean;
} | null>(null);

export function AccountIdentity({
  name,
  role,
}: {
  name: string;
  role: string;
}) {
  const actions = React.useContext(AccountActionsContext);
  return (
    <>
      <div className="min-w-0 text-sm">
        <span className="font-medium text-foreground">{name}</span>
        <span className="ml-2 text-xs text-muted-foreground">{role}</span>
      </div>
      {actions ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={actions.onAccount}
            disabled={actions.busy}
          >
            <UserRound aria-hidden="true" />
            账号
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={actions.onSignOut}
            disabled={actions.busy}
            aria-busy={actions.busy}
          >
            <LogOut aria-hidden="true" />
            退出
          </Button>
        </>
      ) : null}
    </>
  );
}
