'use client';

import { formatCedula, ROLES, type Role, type UserSummary } from '@heribertova/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { AppointUserDialog } from '@/components/usuarios/appoint-user-dialog';
import { ChangeRoleDialog } from '@/components/usuarios/change-role-dialog';
import { UserScopesDialog } from '@/components/usuarios/user-scopes-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { api, ApiError } from '@/lib/api';
import { messages } from '@/messages/es';

const text = messages.admin.usuarios;

type TriState = 'all' | 'true' | 'false';

function optionalBoolean(value: TriState): boolean | undefined {
  return value === 'all' ? undefined : value === 'true';
}

/** `/admin/usuarios` (plan 4.3): the user list with its filters, "Nombrar coordinador", and the
 * per-row actions (activate/deactivate, reset password, unlock, edit recintos). */
export function UsersTable() {
  const queryClient = useQueryClient();
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: api.me });
  const [role, setRole] = useState<Role | ''>('');
  const [isActive, setIsActive] = useState<TriState>('all');
  const [usingDefaultPassword, setUsingDefaultPassword] = useState<TriState>('all');
  const [editingScopesFor, setEditingScopesFor] = useState<UserSummary | null>(null);
  const [changingRoleFor, setChangingRoleFor] = useState<UserSummary | null>(null);

  const filters = {
    role: role || undefined,
    isActive: optionalBoolean(isActive),
    usingDefaultPassword: optionalBoolean(usingDefaultPassword),
  };
  const { data, isPending, isError } = useQuery({
    queryKey: ['users', filters],
    queryFn: () => api.listUsers(filters),
  });

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ['users'] });
  }

  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.updateUser(id, { isActive: active }),
    onSuccess: async () => {
      toast.success(text.success.updated);
      await invalidate();
    },
  });
  const resetPassword = useMutation({
    mutationFn: api.resetUserPassword,
    onSuccess: async () => {
      toast.success(text.success.resetPassword);
      await invalidate();
    },
  });
  const unlock = useMutation({
    mutationFn: api.unlockUser,
    onSuccess: async () => {
      toast.success(text.success.unlocked);
      await invalidate();
    },
  });

  const mutationError = setActive.error ?? resetPassword.error ?? unlock.error;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap gap-4">
          <Field label={text.filters.roleLabel}>
            <NativeSelect
              value={role}
              onChange={(event) => setRole(event.target.value as Role | '')}
            >
              <option value="">{text.filters.roleAll}</option>
              {ROLES.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {messages.roles[candidate]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={text.filters.activeLabel}>
            <NativeSelect
              value={isActive}
              onChange={(event) => setIsActive(event.target.value as TriState)}
            >
              <option value="all">{text.filters.activeAll}</option>
              <option value="true">{text.filters.activeYes}</option>
              <option value="false">{text.filters.activeNo}</option>
            </NativeSelect>
          </Field>
          <Field label={text.filters.defaultPasswordLabel}>
            <NativeSelect
              value={usingDefaultPassword}
              onChange={(event) => setUsingDefaultPassword(event.target.value as TriState)}
            >
              <option value="all">{text.filters.defaultPasswordAll}</option>
              <option value="true">{text.filters.defaultPasswordYes}</option>
              <option value="false">{text.filters.defaultPasswordNo}</option>
            </NativeSelect>
          </Field>
        </div>
        <AppointUserDialog />
      </div>

      {mutationError && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          {mutationError instanceof ApiError ? mutationError.message : messages.errors.generic}
        </p>
      )}

      {isPending && <p className="text-muted-foreground">{text.loading}</p>}
      {isError && <p className="text-muted-foreground">{messages.errors.generic}</p>}
      {data && data.items.length === 0 && <p className="text-muted-foreground">{text.empty}</p>}

      {data && data.items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <Th>{text.table.name}</Th>
                <Th>{text.table.cedula}</Th>
                <Th>{text.table.role}</Th>
                <Th>{text.table.recinto}</Th>
                <Th>{text.table.status}</Th>
                <Th>
                  <span className="sr-only">{text.table.actions}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((user) => (
                <tr key={user.id} className="border-t">
                  <td className="px-3 py-2">{user.person.fullName}</td>
                  <td className="px-3 py-2">{formatCedula(user.username)}</td>
                  <td className="px-3 py-2">{messages.roles[user.role]}</td>
                  <td className="px-3 py-2">
                    {user.person.recintoName} · {user.person.sector}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadges user={user} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {user.role !== 'superadmin' && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            {text.table.actions}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => {
                              if (
                                window.confirm(
                                  text.confirm[user.isActive ? 'deactivate' : 'activate'](
                                    user.person.fullName,
                                  ),
                                )
                              ) {
                                setActive.mutate({ id: user.id, active: !user.isActive });
                              }
                            }}
                          >
                            {user.isActive ? text.actions.deactivate : text.actions.activate}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => {
                              if (
                                window.confirm(text.confirm.resetPassword(user.person.fullName))
                              ) {
                                resetPassword.mutate(user.id);
                              }
                            }}
                          >
                            {text.actions.resetPassword}
                          </DropdownMenuItem>
                          {user.locked && (
                            <DropdownMenuItem
                              onSelect={() => {
                                if (window.confirm(text.confirm.unlock(user.person.fullName))) {
                                  unlock.mutate(user.id);
                                }
                              }}
                            >
                              {text.actions.unlock}
                            </DropdownMenuItem>
                          )}
                          {user.role === 'recinto_coordinator' && (
                            <DropdownMenuItem onSelect={() => setEditingScopesFor(user)}>
                              {text.actions.editScopes}
                            </DropdownMenuItem>
                          )}
                          {me?.role === 'superadmin' && (
                            <DropdownMenuItem onSelect={() => setChangingRoleFor(user)}>
                              {text.actions.changeRole}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingScopesFor && (
        <UserScopesDialog
          user={editingScopesFor}
          onOpenChange={(open) => {
            if (!open) setEditingScopesFor(null);
          }}
        />
      )}

      {changingRoleFor && (
        <ChangeRoleDialog
          user={changingRoleFor}
          onOpenChange={(open) => {
            if (!open) setChangingRoleFor(null);
          }}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 font-medium">{children}</th>;
}

function StatusBadges({ user }: { user: UserSummary }) {
  return (
    <div className="flex flex-wrap gap-1">
      <Badge tone={user.isActive ? 'neutral' : 'warning'}>
        {user.isActive ? text.status.active : text.status.inactive}
      </Badge>
      {user.locked && <Badge tone="warning">{text.status.locked}</Badge>}
      {user.usingDefaultPassword && (
        <Badge tone="neutral">{text.status.usingDefaultPassword}</Badge>
      )}
    </div>
  );
}

function Badge({ tone, children }: { tone: 'neutral' | 'warning'; children: React.ReactNode }) {
  return (
    <span
      className={
        tone === 'warning'
          ? 'rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive'
          : 'rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground'
      }
    >
      {children}
    </span>
  );
}
