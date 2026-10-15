/**
 * Directriz de un callout como en Revu y Foxit (ADR-0042): punta → codo → tramo horizontal que llega al centro del
 * lado de la caja que mira hacia el codo. Pura y sin dependencias: la usan la pantalla, el /AP, el aplanado y la
 * selección por clic, en cualquier unidad (pt, píxeles o coordenadas normalizadas).
 *
 * Una directriz guarda `[punta]` o `[punta, codo]`. Sin codo guardado, el codo queda a `landing` del lado de la caja
 * que mira hacia la punta. Del codo solo cuenta su x: el tramo hasta la caja siempre es horizontal.
 */

export interface CalloutPt {
  x: number;
  y: number;
}

export interface CalloutBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Largo por defecto del tramo horizontal entre el codo y la caja (pt). */
export const CALLOUT_LANDING_PT = 18;

export interface CalloutLeaderLayout {
  tip: CalloutPt;
  knee: CalloutPt;
  attach: CalloutPt;
  /** true si la directriz llega por el lado derecho de la caja. */
  right: boolean;
}

export function calloutLeaderLayout(
  tip: CalloutPt,
  knee: CalloutPt | undefined,
  box: CalloutBox,
  landing: number
): CalloutLeaderLayout {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const right = (knee ?? tip).x > cx;
  const attach = { x: right ? box.x + box.width : box.x, y: cy };
  let kx = knee ? knee.x : attach.x + (right ? landing : -landing);
  // El codo nunca queda dentro de la caja
  kx = right ? Math.max(kx, attach.x) : Math.min(kx, attach.x);
  return { tip, knee: { x: kx, y: cy }, attach, right };
}

/**
 * Caja de un callout nuevo (ADR-0042), como en Revu y Foxit: clic en la punta y soltar donde va el codo; la caja
 * queda a `landing` del codo, del lado contrario a la punta, centrada en vertical con él. Coordenadas normalizadas.
 */
export function calloutBoxFromDrag(
  tip: CalloutPt,
  knee: CalloutPt,
  size: { width: number; height: number },
  landing: number
): [CalloutPt, CalloutPt] {
  const right = knee.x >= tip.x;
  let x0 = right ? knee.x + landing : knee.x - landing - size.width;
  let y0 = knee.y - size.height / 2;
  x0 = Math.max(0, Math.min(1 - size.width, x0));
  y0 = Math.max(0, Math.min(1 - size.height, y0));
  return [
    { x: x0, y: y0 },
    { x: x0 + size.width, y: y0 + size.height },
  ];
}

/**
 * Qué se pinta de la caja del callout (ADR-0042). El borde se elige aparte del relleno (`customFields.calloutBorder`:
 * 1 con borde, 0 sin borde); sin elegirlo, la caja con relleno lleva borde (Foxit) y la que no tiene relleno no
 * (Revu).
 */
export function calloutBoxPaint(markup: {
  style: { fillColor?: string };
  customFields?: Record<string, string | number>;
}): { fill: boolean; border: boolean } {
  const fill = Boolean(markup.style.fillColor && markup.style.fillColor !== 'transparent');
  const b = markup.customFields?.calloutBorder;
  const border = b === undefined ? fill : b === 1 || b === '1';
  return { fill, border };
}
