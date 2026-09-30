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
