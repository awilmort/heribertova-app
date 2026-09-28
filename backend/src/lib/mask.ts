/** Matches a Dominican cédula (11 digits, optionally formatted 000-0000000-0) not embedded in a longer number. */
const CEDULA_PATTERN = /(?<!\d)(\d{3})-?\d{7}-?(\d)(?!\d)/g;

/** Masks every cédula in free text (e.g. a request URL) as "001-*******-2" before it reaches logs. */
export function maskCedulas(text: string): string {
  return text.replace(CEDULA_PATTERN, '$1-*******-$2');
}
