/**
 * Chart colors for `/panel/general` (plan 8.1). Every chart there compares exactly two series
 * (voters vs. registered members, aspirants vs. team leaders), so two categorical slots are
 * enough — validated with the data-viz skill's CVD checker against the app's card surface
 * (`--card`, `#FBF8F3`, brand/BRAND.md): `node validate_palette.js "#2a78d6,#eb6834" --mode light
 * --surface "#FBF8F3"` passes every check (worst adjacent CVD ΔE 24.7, normal-vision ΔE 33.6).
 */
export const CHART_SERIES_A = '#2a78d6';
export const CHART_SERIES_B = '#eb6834';

/** Axis/legend text and gridlines, matching `--muted-foreground` and `--border` (globals.css) —
 * this app has one theme, so these are plain hex rather than a token lookup. */
export const CHART_TEXT_COLOR = '#5e4630';
export const CHART_LINE_COLOR = '#eadfcf';

/** Sequential blue ramp (data-viz skill `references/palette.md`, steps 150->650), light->dark for
 * magnitude encoding — the sector coverage map's only continuous-color chart. Lightest step starts
 * above pure white so a 0%-share zone still reads as "on the ramp" against the card surface. */
export const CHART_SEQUENTIAL_BLUE = [
  '#b7d3f6',
  '#9ec5f4',
  '#86b6ef',
  '#6da7ec',
  '#5598e7',
  '#3987e5',
  '#2a78d6',
  '#256abf',
  '#1c5cab',
  '#184f95',
  '#104281',
] as const;

/** A zone with no sector match in `sector-zone-mapping.ts` — distinct from every ramp step and from
 * the card surface, never implying "0% coverage". */
export const CHART_NO_DATA_COLOR = '#d9d4c8';
