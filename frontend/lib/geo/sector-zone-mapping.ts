/**
 * Maps `higuey-sectores.json` feature ids (barrio-level zones traced from L. Villavicencio's 2015
 * thesis map of Higüey's urban core) to the padrón's `descripcionSector` strings, so the coverage
 * map (`/panel/general`) can color each zone by its sector's affiliation share.
 *
 * Built by exact/near-exact name matching only — a zone is left unmapped (rendered as "sin datos")
 * rather than guessed onto a similarly-named sector. Two pairs that look like typos of each other
 * are genuinely different places and are deliberately NOT matched: "21 DE ENERO" (zone) vs
 * "4 DE ENERO" (padrón), and "LA MALENA" (zone, matched) vs "LA MALENA II" (padrón, left unmapped —
 * the thesis map has no second La Malena polygon). Verón, Punta Cana, La Otra Banda and Las Lagunas
 * de Nisibón are out of scope entirely (no longer part of Higüey) and never appear in the zone file.
 *
 * Covers ~63% of in-scope voters (the largest sectors) as of the padrón's May 2024 cut; the
 * remaining ~37% (e.g. "LA BASILICA", "SAN MARTIN DE PORRES", "CENTRAL", every rural sector) has no
 * matching polygon in the source map and stays in the sector table only.
 */
export const SECTOR_ZONE_MAP: Readonly<Record<string, string>> = {
  'barrio-lindo': 'BARRIO LINDO, VILLA CERRO',
  'bella-vista': 'BELLA VISTA, VILLA CENTRO',
  'brisas-del-llano': 'BRISAS DEL LLANO',
  cambelen: 'CAMBELEN',
  'el-centro': 'CENTRO DE LA CIUDAD',
  'el-centro-el-cerro': 'EL CERRO',
  enriquillo: 'ENRIQUILLO',
  'juan-pablo-duarte': 'JUAN PABLO DUARTE',
  'la-altagracia': 'LA ALTAGRACIA',
  'la-imagen': 'LA IMAGEN',
  'la-malena': 'LA MALENA',
  'las-caobas': 'LAS CAOBAS',
  'las-colinas-de-villa-cerro': 'VILLA CERRO',
  'los-platanitos': 'LOS PLATANITOS',
  'los-rios': 'LOS RIOS',
  'los-soto-abajo': 'LOS SOTOS',
  'los-soto-arriba': 'LOS SOTOS',
  'mama-tingo': 'MAMA TINGO',
  nazaret: 'NAZARETH',
  sajour: 'LOS SAJOUR',
  'san-francisco': 'SAN FRANCISCO',
  'san-jose': 'SAN JOSE',
  'san-martin': 'SAN MARTIN',
  'san-pedro': 'SAN PEDRO',
  savica: 'SAVICA',
  'villa-cerro-arriba': 'VILLA CERRO',
  'villa-cerro-ii': 'VILLA CERRO',
  'villa-cristal': 'VILLA CRISTAL',
  'villa-progreso': 'VILLA PROGRESO, LOS RIOS',
  'villa-progreso-2': 'VILLA PROGRESO, LOS RIOS',
};
