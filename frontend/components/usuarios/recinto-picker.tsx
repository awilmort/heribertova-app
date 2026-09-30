'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * A checklist of recintos, grouped by sector, for assigning a recinto coordinator's `recintoScopes`
 * (plan 4.3). Built on `GET /api/sectors` (plan 2.2), the same tree the app's other recinto filters
 * will use. A scrollable checkbox list rather than a native `<select multiple>`: the latter relies on
 * ctrl/cmd-click to multi-select and is unreliable to scroll through on touch devices, where field
 * coordinators use this.
 */
export function RecintoPicker({
  labelledBy,
  value,
  onChange,
}: {
  labelledBy?: string;
  value: string[];
  onChange: (recintoKeys: string[]) => void;
}) {
  const { data } = useQuery({ queryKey: ['sectors'], queryFn: api.sectors });

  function toggle(recintoKey: string, checked: boolean) {
    onChange(
      checked ? [...value, recintoKey] : value.filter((existing) => existing !== recintoKey),
    );
  }

  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className="flex max-h-64 flex-col gap-4 overflow-y-auto rounded-md border border-input p-3"
    >
      {data?.sectors.map((sector) => (
        <div key={sector.name} className="flex flex-col gap-2">
          <p className="text-sm font-medium text-muted-foreground">{sector.name}</p>
          {sector.recintos.map((recinto) => (
            <label key={recinto.key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={value.includes(recinto.key)}
                onChange={(event) => toggle(recinto.key, event.target.checked)}
              />
              {recinto.name}
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}
