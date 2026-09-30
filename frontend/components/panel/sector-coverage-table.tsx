'use client';

import type { GeneralDashboardSector } from '@heribertova/shared';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/lib/permissions';
import { messages } from '@/messages/es';

const text = messages.panelGeneral.sectors.table;
const nf = new Intl.NumberFormat('es-DO');

/** Members ÷ voters, 0 for a sector with no voters (never happens in real data). */
function shareOf(item: GeneralDashboardSector): number {
  return item.voterCount > 0 ? item.memberCount / item.voterCount : 0;
}

/**
 * `/panel/general`'s coverage-by-sector table (plan 8.1): sorted by the backend, already scoped to
 * the caller's recintos. Each row links to `/recintos` pre-filtered to that sector (7.2's table
 * reads its initial filter from the URL) for anyone who can open that page.
 */
export function SectorCoverageTable({ items }: { items: GeneralDashboardSector[] }) {
  const canViewRecintos = usePermission('recintos.assignCoordinator');

  if (items.length === 0) {
    return <p className="text-muted-foreground">{messages.panelGeneral.sectors.empty}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr>
            <Th>{text.sector}</Th>
            <Th>{text.voters}</Th>
            <Th>{text.members}</Th>
            <Th>{text.share}</Th>
            <Th>{text.recintos}</Th>
            <Th>{text.withoutMembers}</Th>
            {canViewRecintos && (
              <Th>
                <span className="sr-only">{text.viewLink}</span>
              </Th>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.sector} className="border-t">
              <td className="px-3 py-2">{item.sector}</td>
              <td className="px-3 py-2">{nf.format(item.voterCount)}</td>
              <td className="px-3 py-2">{nf.format(item.memberCount)}</td>
              <td className="px-3 py-2">{Math.round(shareOf(item) * 100)}%</td>
              <td className="px-3 py-2">{item.recintoCount}</td>
              <td className="px-3 py-2">{item.recintosWithoutMembers}</td>
              {canViewRecintos && (
                <td className="px-3 py-2 text-right">
                  <Button asChild variant="link" className="h-auto p-0">
                    <Link href={`/recintos?sector=${encodeURIComponent(item.sector)}`}>
                      {text.viewLink}
                    </Link>
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 font-medium">{children}</th>;
}
