'use client';

import { formatCedula, type PersonDetail, type PersonSummary } from '@heribertova/shared';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { MemberAvatar } from '@/components/equipo/member-avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { messages } from '@/messages/es';

const text = messages.equipo.profileDialog;

/** Read-only profile of one member: their photo plus the full record (`PersonSummary` alone has no
 * contact fields, so this loads `PersonDetail`, same query key as `EditPersonDialog`). */
export function PersonProfileDialog({
  person,
  onEdit,
  onOpenChange,
}: {
  person: PersonSummary;
  onEdit: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: detail } = useQuery({
    queryKey: ['person', person.id],
    queryFn: () => api.getPerson(person.id),
  });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{text.title(person.fullName)}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          <MemberAvatar person={person} size="lg" />
          <dl className="grid w-full grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <Row label={text.cedula}>{formatCedula(person.cedula)}</Row>
            <Row label={text.recinto}>
              {person.recintoName} · {person.sector}
            </Row>
            <Row label={text.level}>{messages.levels[person.level]}</Row>
            <Row label={text.status}>
              {person.status ? messages.equipo.status[person.status] : messages.equipo.status.none}
            </Row>
            <Row label={text.documents}>{messages.equipo.docStatus[person.docStatus]}</Row>
            {detail ? (
              <ContactRows detail={detail} />
            ) : (
              <Loader2
                className="col-span-2 mx-auto size-5 animate-spin text-muted-foreground"
                aria-hidden
              />
            )}
          </dl>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {text.close}
          </Button>
          <Button type="button" onClick={onEdit}>
            {text.edit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ContactRows({ detail }: { detail: PersonDetail }) {
  const withWhatsapp = (phone: string, whatsapp: boolean | null) =>
    whatsapp ? `${phone} · ${text.whatsapp}` : phone;

  return (
    <>
      <Row label={text.phone}>{withWhatsapp(detail.phone, detail.phoneWhatsapp)}</Row>
      <Row label={text.phone2}>
        {detail.phone2 ? withWhatsapp(detail.phone2, detail.phone2Whatsapp) : text.none}
      </Row>
      <Row label={text.email}>{detail.email ?? text.none}</Row>
      {detail.validatedAt && (
        <Row label={text.validatedAt}>
          {new Date(detail.validatedAt).toLocaleDateString('es-DO')}
        </Row>
      )}
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}
