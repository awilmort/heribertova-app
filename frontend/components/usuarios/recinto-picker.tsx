'use client';

import { useQuery } from '@tanstack/react-query';
import type { ChangeEvent } from 'react';
import { NativeSelect } from '@/components/ui/native-select';
import { api } from '@/lib/api';

/**
 * A multi-select of recintos, grouped by sector, for assigning a recinto coordinator's
 * `recintoScopes` (plan 4.3). Built on `GET /api/sectors` (plan 2.2), the same tree the app's other
 * recinto filters will use.
 */
export function RecintoPicker({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string[];
  onChange: (recintoKeys: string[]) => void;
}) {
  const { data } = useQuery({ queryKey: ['sectors'], queryFn: api.sectors });

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    onChange(Array.from(event.target.selectedOptions, (option) => option.value));
  }

  return (
    <NativeSelect id={id} multiple value={value} onChange={handleChange}>
      {data?.sectors.map((sector) => (
        <optgroup key={sector.name} label={sector.name}>
          {sector.recintos.map((recinto) => (
            <option key={recinto.key} value={recinto.key}>
              {recinto.name}
            </option>
          ))}
        </optgroup>
      ))}
    </NativeSelect>
  );
}
