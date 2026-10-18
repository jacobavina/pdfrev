/**
 * Utilidades compartidas para parseo, normalización y formateo de fechas PDF e ISO 8601.
 * Sin dependencias de pdf-lib ni del DOM, permitiendo su uso tanto en el lector PDF
 * como en componentes UI, ordenación y servicios de exportación sin inflar los chunks.
 */

/**
 * Convierte una fecha PDF (ISO 32000-1 §7.9.4: `(D:YYYYMMDDHHmmSSOHH'mm')`) o una cadena ISO
 * a formato canónico ISO 8601 (`YYYY-MM-DDTHH:mm:ss.sssZ`).
 * Soporta husos horarios (+HH'mm', -HH'mm', Z) respetando la hora exacta en UTC.
 */
export function parsePdfDateToIso(raw?: string | null, fallbackIso?: string): string {
  const fallback = fallbackIso !== undefined ? fallbackIso : new Date().toISOString();
  if (!raw) return fallback;
  const trimmed = raw.trim().replace(/^\(+|\)+$/g, '');
  if (!trimmed) return fallback;

  // Regex ISO 32000-1: D:YYYYMMDDHHmmSS[Z | +HH'mm' | -HH'mm']
  const m = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:([Zz])|([+-]\d{2})'?(?:(\d{2})'?)?)?/i.exec(trimmed);
  if (m) {
    const yyyy = m[1];
    const mm = m[2] || '01';
    const dd = m[3] || '01';
    const hh = m[4] || '00';
    const min = m[5] || '00';
    const ss = m[6] || '00';
    const tz = m[7] ? 'Z' : m[8] ? `${m[8]}:${m[9] || '00'}` : 'Z';
    const d = new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}${tz}`);
    return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
  }

  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  return fallback;
}

/**
 * Formatea una fecha ISO o PDF para mostrar en tablas y listados.
 * Devuelve un formato amigable (`M/D/YYYY HH:MM`) y garantiza que bajo ninguna circunstancia
 * retorne "Invalid Date". Si la fecha es nula o inválida, devuelve "—".
 */
export function formatDateForDisplay(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    const iso = parsePdfDateToIso(dateStr, '');
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return `${d.toLocaleDateString('en-US')} ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return '—';
  }
}

/**
 * Convierte una fecha a milisegundos desde época para comparaciones de ordenamiento.
 */
export function parseDateToTimestamp(dateStr?: string | null): number {
  if (!dateStr) return 0;
  const iso = parsePdfDateToIso(dateStr, '');
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}
