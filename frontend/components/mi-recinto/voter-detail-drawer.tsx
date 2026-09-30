'use client';

import { formatCedula, type RecintoVoterItem } from '@heribertova/shared';
import { NewPersonDialog } from '@/components/equipo/new-person-dialog';
import { NominateAspirantDialog } from '@/components/lideres/nominate-aspirant-dialog';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { MembershipBadge } from '@/components/voters/membership-badge';
import { usePermission } from '@/lib/permissions';
import { messages } from '@/messages/es';

const fieldText = messages.padron;
const text = messages.miRecinto.detail;

/** The voter detail drawer of `/mi-recinto` (plan 7.1): age, birthday, colegio and membership, plus
 * "Registrar como miembro" and "Nominar aspirante" — both reuse the 5.3/6.3 dialogs as-is
 * (`initialCedula`), so registration and nomination stay in exactly one place each. */
export function VoterDetailDrawer({
  voter,
  onOpenChange,
}: {
  voter: RecintoVoterItem;
  onOpenChange: (open: boolean) => void;
}) {
  const canRegister = usePermission('people.create');
  const canNominate = usePermission('leaders.nominate');
  const notYetMember = voter.membership.status === 'none';

  const rows: [string, string][] = [
    [fieldText.fields.cedula, formatCedula(voter.cedula)],
    [fieldText.fields.age, fieldText.years(voter.age)],
    [fieldText.fields.birthday, fieldText.birthday(voter.birthDay, voter.birthMonth)],
    [fieldText.fields.colegio, fieldText.colegio(voter.colegioId)],
  ];

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{voter.fullName}</SheetTitle>
          <MembershipBadge membership={voter.membership} />
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {rows.map(([label, value]) => (
              <Row key={label} label={label} value={value} />
            ))}
            {voter.membership.status === 'member' && voter.membership.leaderName && (
              <Row label={fieldText.fields.leader} value={voter.membership.leaderName} />
            )}
          </dl>

          <div className="flex flex-col gap-2">
            {canRegister && notYetMember && (
              <NewPersonDialog initialCedula={voter.cedula} triggerLabel={text.registerAsMember} />
            )}
            {canNominate && (
              <NominateAspirantDialog
                initialCedula={voter.cedula}
                triggerLabel={messages.lideres.nominate}
              />
            )}
          </div>
        </div>

        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {text.close}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
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
