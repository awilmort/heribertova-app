'use client';

import type { GeneralDashboardSector } from '@heribertova/shared';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CHART_NO_DATA_COLOR, CHART_SEQUENTIAL_BLUE } from '@/components/charts/theme';
import higueySectores from '@/lib/geo/higuey-sectores.json';
import { SECTOR_ZONE_MAP } from '@/lib/geo/sector-zone-mapping';
import { usePermission } from '@/lib/permissions';
import { messages } from '@/messages/es';

const text = messages.panelGeneral.map;
const nf = new Intl.NumberFormat('es-DO');

type LonLat = readonly [number, number];

interface ZoneFeature {
  id: string;
  name: string;
  ring: LonLat[];
}

interface RawGeoJSON {
  features: {
    id: string;
    properties: { name: string };
    geometry: { coordinates: number[][][] };
  }[];
}

const ZONES: ZoneFeature[] = (higueySectores as RawGeoJSON).features.map((feature) => ({
  id: feature.id,
  name: feature.properties.name,
  // Every ring here comes from `higuey-sectores.json`'s own single-ring polygons (checked at
  // authoring time, see its header comment) — never empty, always [lon, lat] pairs.
  ring: feature.geometry.coordinates[0]!.map((pt): LonLat => [pt[0]!, pt[1]!]),
}));

const LONS = ZONES.flatMap((zone) => zone.ring.map(([lon]) => lon));
const LATS = ZONES.flatMap((zone) => zone.ring.map(([, lat]) => lat));
const MIN_LON = Math.min(...LONS);
const MAX_LON = Math.max(...LONS);
const MIN_LAT = Math.min(...LATS);
const MAX_LAT = Math.max(...LATS);

const VIEW_WIDTH = 760;
const PAD = 16;
/** Longitude degrees shrink by cos(latitude) relative to latitude degrees at this latitude — the
 * map's bounding box is small enough that a flat correction (vs. a real projection) is accurate. */
const LAT_CORRECTION = Math.cos((((MIN_LAT + MAX_LAT) / 2) * Math.PI) / 180);
const VIEW_HEIGHT = Math.round(
  (VIEW_WIDTH - 2 * PAD) * ((MAX_LAT - MIN_LAT) / ((MAX_LON - MIN_LON) * LAT_CORRECTION)) +
    2 * PAD,
);

function project([lon, lat]: LonLat): LonLat {
  const x =
    PAD + ((lon - MIN_LON) * LAT_CORRECTION * (VIEW_WIDTH - 2 * PAD)) / ((MAX_LON - MIN_LON) * LAT_CORRECTION);
  const y = PAD + ((MAX_LAT - lat) * (VIEW_HEIGHT - 2 * PAD)) / (MAX_LAT - MIN_LAT);
  return [x, y];
}

function pathFor(ring: LonLat[]): string {
  return (
    ring
      .map((point, i) => {
        const [x, y] = project(point);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ') + ' Z'
  );
}

function centroid(ring: LonLat[]): LonLat {
  const points = ring.map(project);
  const [sx, sy] = points.reduce(([ax, ay], [x, y]) => [ax + x, ay + y], [0, 0]);
  return [sx / points.length, sy / points.length];
}

function colorForShare(share: number): string {
  const steps = CHART_SEQUENTIAL_BLUE;
  const index = Math.min(steps.length - 1, Math.round(share * (steps.length - 1)));
  // `index` is clamped into [0, steps.length - 1] above, so this is always defined.
  return steps[index]!;
}

interface ZoneInfo {
  sector: string | null;
  item: GeneralDashboardSector | null;
  share: number;
}

/**
 * `/panel/general`'s coverage-by-sector map (plan 8.1): a thesis-sourced reference map of Higüey's
 * urban-core barrios (`lib/geo/higuey-sectores.json`, approximate georeferencing — see its own
 * header comment), colored by each matched zone's affiliation share. Only zones with a confident
 * name match in `sector-zone-mapping.ts` carry data (~63% of in-scope voters); the rest render as
 * "sin datos" rather than guessing — the table above stays the complete source of truth.
 */
export function SectorCoverageMap({ items }: { items: GeneralDashboardSector[] }) {
  const canViewRecintos = usePermission('recintos.assignCoordinator');
  const [hovered, setHovered] = useState<string | null>(null);

  const bySector = useMemo(() => new Map(items.map((item) => [item.sector, item])), [items]);

  const zoneInfo = useMemo(() => {
    const map = new Map<string, ZoneInfo>();
    for (const zone of ZONES) {
      const sector = SECTOR_ZONE_MAP[zone.id] ?? null;
      const item = sector ? (bySector.get(sector) ?? null) : null;
      const share = item && item.voterCount > 0 ? item.memberCount / item.voterCount : 0;
      map.set(zone.id, { sector, item, share });
    }
    return map;
  }, [bySector]);

  const hoveredZone = hovered ? ZONES.find((zone) => zone.id === hovered) : null;
  const hoveredInfo = hovered ? zoneInfo.get(hovered) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <svg
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          className="w-full rounded-md border border-border bg-card"
          role="img"
          aria-label={text.title}
        >
          {ZONES.map((zone) => {
            const info = zoneInfo.get(zone.id);
            const fill = info?.item ? colorForShare(info.share) : CHART_NO_DATA_COLOR;
            const isHovered = hovered === zone.id;
            return (
              <path
                key={zone.id}
                d={pathFor(zone.ring)}
                fill={fill}
                stroke={isHovered ? CHART_SEQUENTIAL_BLUE[CHART_SEQUENTIAL_BLUE.length - 1] : '#fff'}
                strokeWidth={isHovered ? 2 : 0.8}
                tabIndex={info?.item ? 0 : -1}
                onPointerEnter={() => setHovered(zone.id)}
                onPointerLeave={() => setHovered((current) => (current === zone.id ? null : current))}
                onFocus={() => setHovered(zone.id)}
                onBlur={() => setHovered((current) => (current === zone.id ? null : current))}
              >
                <title>{zone.name}</title>
              </path>
            );
          })}
        </svg>
        {hoveredZone && hoveredInfo && (
          <div
            className="pointer-events-none absolute z-10 w-56 -translate-x-1/2 rounded-md border border-border bg-popover p-3 text-sm text-popover-foreground shadow-md"
            style={{
              left: `${(centroid(hoveredZone.ring)[0] / VIEW_WIDTH) * 100}%`,
              top: `${(centroid(hoveredZone.ring)[1] / VIEW_HEIGHT) * 100}%`,
            }}
          >
            <p className="font-medium">{hoveredZone.name}</p>
            {hoveredInfo.item ? (
              <dl className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
                <div className="flex justify-between gap-3">
                  <dt>{text.tooltip.sector}</dt>
                  <dd className="font-medium text-foreground">{hoveredInfo.item.sector}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>{text.tooltip.voters}</dt>
                  <dd className="font-medium text-foreground">
                    {nf.format(hoveredInfo.item.voterCount)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>{text.tooltip.members}</dt>
                  <dd className="font-medium text-foreground">
                    {nf.format(hoveredInfo.item.memberCount)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>{text.tooltip.share}</dt>
                  <dd className="font-medium text-foreground">
                    {Math.round(hoveredInfo.share * 100)}%
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-1 text-muted-foreground">{text.tooltip.noData}</p>
            )}
            {canViewRecintos && hoveredInfo.item && (
              <Link
                href={`/recintos?sector=${encodeURIComponent(hoveredInfo.item.sector)}`}
                className="pointer-events-auto mt-2 inline-block text-primary underline"
              >
                {text.tooltip.viewLink}
              </Link>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span>{text.legend.low}</span>
          <div className="flex h-3 w-32 overflow-hidden rounded-sm">
            {CHART_SEQUENTIAL_BLUE.map((color) => (
              <span key={color} className="h-full flex-1" style={{ backgroundColor: color }} />
            ))}
          </div>
          <span>{text.legend.high}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: CHART_NO_DATA_COLOR }} />
          <span>{text.legend.noData}</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{text.caption}</p>
    </div>
  );
}
