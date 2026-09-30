// @vitest-environment jsdom
import type { SectorsResponse } from '@heribertova/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecintoPicker } from './recinto-picker';

const sectors: SectorsResponse = {
  sectors: [
    {
      name: 'CENTRO CIUDAD',
      voterCount: 100,
      recintos: [
        {
          key: 'liceo--centro-ciudad',
          name: 'LICEO JUAN PABLO DUARTE',
          voterCount: 60,
          colegios: [],
        },
        { key: 'escuela--centro-ciudad', name: 'ESCUELA PRIMARIA', voterCount: 40, colegios: [] },
      ],
    },
    {
      name: 'JUANILLO',
      voterCount: 50,
      recintos: [{ key: 'rural--juanillo', name: 'ESCUELA RURAL', voterCount: 50, colegios: [] }],
    },
  ],
};

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(sectors), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

function renderPicker(value: string[], onChange: (keys: string[]) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RecintoPicker value={value} onChange={onChange} />
    </QueryClientProvider>,
  );
}

describe('RecintoPicker', () => {
  it('lists every recinto, grouped by sector', async () => {
    renderPicker([], () => {});
    expect(await screen.findByText('LICEO JUAN PABLO DUARTE')).toBeDefined();
    expect(screen.getByText('ESCUELA PRIMARIA')).toBeDefined();
    expect(screen.getByText('ESCUELA RURAL')).toBeDefined();
  });

  it('reports the selected recinto keys on change', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderPicker([], onChange);
    await screen.findByText('LICEO JUAN PABLO DUARTE');

    await user.click(screen.getByRole('checkbox', { name: 'LICEO JUAN PABLO DUARTE' }));

    expect(onChange).toHaveBeenLastCalledWith(['liceo--centro-ciudad']);
  });

  it('shows the given value as selected', async () => {
    renderPicker(['escuela--centro-ciudad'], () => {});
    const checkbox = await screen.findByRole('checkbox', { name: 'ESCUELA PRIMARIA' });
    expect(checkbox).toHaveProperty('checked', true);
  });
});
