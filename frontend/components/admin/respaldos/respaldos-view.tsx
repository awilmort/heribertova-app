'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { messages } from '@/messages/es';

const text = messages.admin.respaldos;

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : messages.errors.generic;
}

function megabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toLocaleString('es-DO', { maximumFractionDigits: 1 });
}

/** `/admin/respaldos` (plan 9.3): a single manual "make a backup now" action — no schedule, no
 * history, since exactly one backup is kept and it always replaces the previous one — plus the
 * Atlas M0 storage budget the backup exists to protect against. */
export function RespaldosView() {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ['backupStatus'], queryFn: api.backupStatus });

  const create = useMutation({
    mutationFn: api.createBackup,
    onSuccess: async () => {
      toast.success(text.success);
      await queryClient.invalidateQueries({ queryKey: ['backupStatus'] });
    },
  });

  function onCreate() {
    if (window.confirm(text.confirmCreate)) create.mutate();
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button type="button" onClick={onCreate} disabled={create.isPending} className="self-start">
          {create.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {create.isPending ? text.creating : text.create}
        </Button>
        {create.isError && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            {errorMessage(create.error)}
          </p>
        )}
      </div>

      {status.isPending && <p className="text-muted-foreground">{text.loading}</p>}
      {status.isError && <p className="text-muted-foreground">{messages.errors.generic}</p>}

      {status.data && (
        <div className="flex flex-col gap-4 rounded-lg border p-4">
          <div>
            <h2 className="font-medium">{text.last.title}</h2>
            {status.data.lastBackup ? (
              <p className="text-sm text-muted-foreground">
                {text.last.createdAt(
                  new Date(status.data.lastBackup.createdAt).toLocaleString('es-DO'),
                )}
                {' · '}
                {text.last.collections(status.data.lastBackup.collections.length)}
                {' · '}
                {text.last.size(
                  megabytes(
                    status.data.lastBackup.collections.reduce((sum, c) => sum + c.bytes, 0),
                  ),
                )}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{text.never}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="font-medium">{text.storage.title}</h2>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={
                  status.data.storage.warn
                    ? 'h-full bg-destructive'
                    : status.data.storage.percentUsed >= 0.5
                      ? 'h-full bg-amber-500'
                      : 'h-full bg-primary'
                }
                style={{
                  width: `${Math.min(100, Math.round(status.data.storage.percentUsed * 100))}%`,
                }}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {text.storage.usage(
                megabytes(status.data.storage.bytes),
                megabytes(status.data.storage.limitBytes),
                Math.round(status.data.storage.percentUsed * 100),
              )}
            </p>
            {status.data.storage.warn && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive/5 p-4"
              >
                {text.storage.warning}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
