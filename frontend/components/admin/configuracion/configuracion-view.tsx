'use client';

import type { PromotionSettings } from '@heribertova/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import { messages } from '@/messages/es';

const text = messages.admin.configuracion;

type FieldKey = keyof PromotionSettings;

const FIELDS: readonly FieldKey[] = [
  'nominationMinInitialMembers',
  'autoPromotionThreshold',
  'teamGoal',
  'maxOpenAspirantsPerNominator',
];

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : messages.errors.generic;
}

/** `/admin/configuracion`: the promotion thresholds (plan 6.1) — read by anyone logged in, but
 * only editable here, since `PUT /api/settings/promotion` requires `settings.manage`. */
export function ConfiguracionView() {
  const queryClient = useQueryClient();
  const settingsId = useId();
  const query = useQuery({ queryKey: ['promotionSettings'], queryFn: api.promotionSettings });
  // Edits on top of the loaded settings, so a background refetch never clobbers what the
  // operator is mid-typing; `onSuccess` below re-seeds this from the saved values.
  const [edits, setEdits] = useState<Partial<PromotionSettings>>({});
  const values = query.data ? { ...query.data, ...edits } : null;

  const save = useMutation({
    mutationFn: api.updatePromotionSettings,
    onSuccess: async () => {
      setEdits({});
      toast.success(text.success);
      await queryClient.invalidateQueries({ queryKey: ['promotionSettings'] });
    },
  });

  function setField(field: FieldKey, raw: string) {
    const parsed = Number(raw);
    setEdits((current) => ({ ...current, [field]: Number.isFinite(parsed) ? parsed : 0 }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (values) save.mutate(values);
  }

  if (query.isPending) return <p className="text-muted-foreground">{text.loading}</p>;
  if (query.isError || !values) {
    return <p className="text-muted-foreground">{messages.errors.generic}</p>;
  }

  const complete = FIELDS.every((field) => values[field] >= 1);

  return (
    <form onSubmit={submit} className="flex max-w-xl flex-col gap-6">
      {FIELDS.map((field) => (
        <div key={field} className="flex flex-col gap-2">
          <label htmlFor={`${settingsId}-${field}`} className="text-sm font-medium">
            {text.fields[field].label}
          </label>
          <Input
            id={`${settingsId}-${field}`}
            type="number"
            min={1}
            step={1}
            value={values[field]}
            onChange={(event) => setField(field, event.target.value)}
            className="max-w-40"
          />
          <p className="text-sm text-muted-foreground">{text.fields[field].hint}</p>
        </div>
      ))}
      {save.isError && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          {errorMessage(save.error)}
        </p>
      )}
      <Button
        type="submit"
        size="lg"
        className="h-11 self-start"
        disabled={!complete || save.isPending}
      >
        {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
        {save.isPending ? text.saving : text.save}
      </Button>
    </form>
  );
}
