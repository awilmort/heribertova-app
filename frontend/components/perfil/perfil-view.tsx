'use client';

import { formatCedula } from '@heribertova/shared';
import { useQuery } from '@tanstack/react-query';
import { ChangePasswordForm } from '@/components/perfil/change-password-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { messages } from '@/messages/es';

const text = messages.perfil;

/** `/perfil` (plan 3.4): my data (from `GET /me`) and the change-password form. */
export function PerfilView() {
  const { data, isPending, isError } = useQuery({ queryKey: ['me'], queryFn: api.me });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{text.title}</h1>

      {isPending && <p className="text-muted-foreground">{text.loading}</p>}
      {isError && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          {messages.errors.generic}
        </p>
      )}

      {data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2 className="text-lg">{text.myDataTitle}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <Row label={text.fields.fullName} value={data.person.fullName} />
                <Row label={text.fields.cedula} value={formatCedula(data.user.username)} />
                <Row label={text.fields.recinto} value={data.person.recintoName} />
                <Row label={text.fields.sector} value={data.person.sector} />
                <Row label={text.fields.role} value={messages.roles[data.role]} />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2 className="text-lg">{text.changePasswordTitle}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChangePasswordForm role={data.role} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </>
  );
}
