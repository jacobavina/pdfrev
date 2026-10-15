import { getHelveticaTextWidth } from './helveticaMetrics';
import { StampDef, StampIconId, boldTextWidth, stampLayout, stampSubtitle } from './stamps';

/**
 * Dibujo de los sellos de Revu y Foxit (ADR-0045). Puro: a partir de la definición, la caja (y hacia abajo, en
 * cualquier unidad) y los textos, devuelve trazados SVG de solo M/L/C/Q/Z y textos Helvetica. La pantalla los pinta
 * como SVG y el /AP como operadores, así el sello se ve igual en REA, Revu y Acrobat.
 */

export type StampPrim =
  | { t: 'path'; d: string; fill?: string; stroke?: string; width?: number }
  | {
      t: 'text';
      x: number;
      y: number;
      text: string;
      size: number;
      color: string;
      bold?: boolean;
      italic?: boolean;
      align: 'left' | 'center';
    };

export interface StampBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const WHITE = '#ffffff';
const INK = '#1f2937';
const f = (n: number) => n.toFixed(2);
const pad2 = (n: number) => String(n).padStart(2, '0');

// ---------------------------------------------------------------- textos dinámicos

function clock(d: Date, seconds: boolean): string {
  const h = d.getHours();
  return `${pad2(h % 12 || 12)}:${pad2(d.getMinutes())}${seconds ? `:${pad2(d.getSeconds())}` : ''} ${h < 12 ? 'am' : 'pm'}`;
}

function dmy(d: Date, sep: string): string {
  return `${pad2(d.getDate())}${sep}${pad2(d.getMonth() + 1)}${sep}${d.getFullYear()}`;
}

/**
 * Título y línea dinámica de un sello al colocarlo: Foxit "Ana, 15/10/2026, 04:18:40 pm"; Revu "15/10/2026
 * 04:17:19 pm"; sellos de fecha con la fecha como título; Released con autor y fecha en sus renglones.
 */
export function stampTexts(def: StampDef, author: string, iso: string): { title: string; subtitle: string } {
  const d = new Date(iso);
  const valid = !Number.isNaN(d.getTime());
  const who = author || 'Reviewer';
  if (def.kind === 'date') {
    if (!valid) return { title: def.label, subtitle: '' };
    const day = dmy(d, def.date === 'dot' ? '.' : '/');
    return { title: def.time ? `${day} ${clock(d, false)}` : day, subtitle: '' };
  }
  if (def.kind === 'released') return { title: def.label, subtitle: `${who}\n${valid ? dmy(d, '/') : ''}` };
  const dyn = def.dynamic ?? 'by';
  if (dyn === 'none' || !valid) return { title: def.label, subtitle: dyn === 'by' ? stampSubtitle(who, iso) : '' };
  if (dyn === 'foxit') return { title: def.label, subtitle: `${who}, ${dmy(d, '/')}, ${clock(d, true)}` };
  if (dyn === 'revu') return { title: def.label, subtitle: `${dmy(d, '/')} ${clock(d, true)}` };
  return { title: def.label, subtitle: stampSubtitle(who, iso) };
}

/** Tamaño por defecto del sello en pt (para colocarlo con un clic). */
export function stampDefaultSize(def: StampDef, title: string, subtitle: string): { width: number; height: number } {
  const kind = def.kind ?? 'outline';
  const reg = (t: string, s: number) => getHelveticaTextWidth(t, s);
  switch (kind) {
    case 'filled':
      if (subtitle) return { width: Math.max(reg(title, 11), boldTextWidth(subtitle, 6)) + 24, height: 36 };
      return { width: reg(title, 14) + (def.icon ? 24 : 0) + 28, height: 32 };
    case 'text':
      if (subtitle) return { width: Math.max(boldTextWidth(title, 18), reg(subtitle, 6)) + 14, height: 36 };
      return { width: boldTextWidth(title, 16) + 16, height: 26 };
    case 'date':
      return { width: reg(title, 13) + 12, height: 20 };
    case 'tag':
      return { width: boldTextWidth(title, 13) + 34, height: 28 };
    case 'seal':
      return { width: 64, height: 64 };
    case 'watermark':
      return { width: boldTextWidth(title, 22) + 10, height: 30 };
    case 'released':
      return { width: 96, height: 48 };
    case 'proprietary':
      return { width: reg(title, 10) + 8, height: 14 };
    default: {
      const titleW = boldTextWidth(title, 16);
      const subW = reg(subtitle, 7);
      return { width: Math.max(titleW, subW) + 24, height: subtitle ? 42 : 30 };
    }
  }
}

// ---------------------------------------------------------------- formas

function roundRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  return (
    `M ${f(x + rr)} ${f(y)} L ${f(x + w - rr)} ${f(y)} Q ${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + rr)} ` +
    `L ${f(x + w)} ${f(y + h - rr)} Q ${f(x + w)} ${f(y + h)} ${f(x + w - rr)} ${f(y + h)} L ${f(x + rr)} ${f(y + h)} ` +
    `Q ${f(x)} ${f(y + h)} ${f(x)} ${f(y + h - rr)} L ${f(x)} ${f(y + rr)} Q ${f(x)} ${f(y)} ${f(x + rr)} ${f(y)} Z`
  );
}

function circle(cx: number, cy: number, r: number): string {
  const k = 0.5522847498 * r;
  return (
    `M ${f(cx + r)} ${f(cy)} C ${f(cx + r)} ${f(cy + k)} ${f(cx + k)} ${f(cy + r)} ${f(cx)} ${f(cy + r)} ` +
    `C ${f(cx - k)} ${f(cy + r)} ${f(cx - r)} ${f(cy + k)} ${f(cx - r)} ${f(cy)} ` +
    `C ${f(cx - r)} ${f(cy - k)} ${f(cx - k)} ${f(cy - r)} ${f(cx)} ${f(cy - r)} ` +
    `C ${f(cx + k)} ${f(cy - r)} ${f(cx + r)} ${f(cy - k)} ${f(cx + r)} ${f(cy)} Z`
  );
}

/** Iconos de los sellos estándar de Foxit en una caja unidad (y hacia abajo), como trazos blancos. */
const ICONS: Record<StampIconId, string> = {
  check: 'M .14 .54 L .4 .8 L .88 .22',
  x: 'M .2 .2 L .8 .8 M .8 .2 L .2 .8',
  triangle: 'M .5 .1 L .92 .86 L .08 .86 Z M .36 .6 L .46 .71 L .65 .46',
  pencil: 'M .16 .84 L .26 .58 L .68 .16 L .84 .32 L .42 .74 Z M .6 .24 L .76 .4',
  search: `${circle(0.42, 0.42, 0.27)} M .62 .62 L .88 .88`,
  envelope: 'M .1 .24 L .9 .24 L .9 .78 L .1 .78 Z M .1 .26 L .5 .56 L .9 .26',
  stamp: 'M .4 .12 L .6 .12 L .57 .48 L .43 .48 Z M .14 .5 L .86 .5 L .86 .68 L .14 .68 Z M .2 .84 L .8 .84',
  clock: `${circle(0.5, 0.5, 0.38)} M .5 .27 L .5 .5 L .67 .6`,
  warning: 'M .5 .08 L .93 .88 L .07 .88 Z M .5 .36 L .5 .62 M .5 .72 L .5 .76',
  document: 'M .22 .08 L .62 .08 L .8 .26 L .8 .92 L .22 .92 Z M .62 .08 L .62 .26 L .8 .26 M .34 .44 L .68 .44 M .34 .58 L .68 .58 M .34 .72 L .58 .72',
  lock: 'M .24 .46 L .76 .46 L .76 .9 L .24 .9 Z M .34 .46 L .34 .32 C .34 .1 .66 .1 .66 .32 L .66 .46 M .5 .62 L .5 .74',
  clipboard: 'M .24 .16 L .76 .16 L .76 .92 L .24 .92 Z M .4 .08 L .6 .08 L .6 .22 L .4 .22 Z M .35 .56 L .46 .67 L .65 .43',
};

/** Lleva un trazado de la caja unidad a la caja (x, y, tamaño). */
function placeIcon(d: string, x: number, y: number, size: number): string {
  let even = true;
  return d.replace(/-?\d*\.?\d+/g, (num) => {
    const v = Number(num) * size + (even ? x : y);
    even = !even;
    return f(v);
  });
}

/** Tamaño de letra que cabe en `maxW` (nunca mayor que `size`). */
function fit(width: (s: number) => number, size: number, maxW: number): number {
  const w = width(size);
  return w > maxW && w > 0 ? (size * maxW) / w : size;
}

// ---------------------------------------------------------------- dibujo

export function stampArt(def: StampDef, box: StampBox, title: string, subtitle: string, color: string): StampPrim[] {
  const { x, y, w, h } = box;
  const kind = def.kind ?? 'outline';
  const out: StampPrim[] = [];
  const reg = (t: string) => (s: number) => getHelveticaTextWidth(t, s);
  const bold = (t: string) => (s: number) => boldTextWidth(t, s);

  switch (kind) {
    case 'filled': {
      // Foxit: caja de color, marco blanco interior, texto blanco y, en los estándar, icono a la izquierda
      const inset = Math.max(1.2, h * 0.1);
      out.push({ t: 'path', d: roundRect(x, y, w, h, Math.min(3, h * 0.08)), fill: color });
      out.push({
        t: 'path',
        d: roundRect(x + inset, y + inset, w - inset * 2, h - inset * 2, Math.min(2, h * 0.05)),
        stroke: WHITE,
        width: Math.max(0.6, h * 0.035),
      });
      if (subtitle) {
        const left = x + inset * 2.2;
        const maxW = w - inset * 4.4;
        out.push({ t: 'text', x: left, y: y + h * 0.48, text: title, size: fit(reg(title), h * 0.3, maxW), color: WHITE, align: 'left' });
        out.push({ t: 'text', x: left, y: y + h * 0.78, text: subtitle, size: fit(bold(subtitle), h * 0.165, maxW), color: WHITE, bold: true, align: 'left' });
        break;
      }
      let left = x + inset * 2;
      if (def.icon) {
        const size = h * 0.5;
        out.push({ t: 'path', d: placeIcon(ICONS[def.icon], left, y + (h - size) / 2, size), stroke: WHITE, width: Math.max(0.7, size * 0.09) });
        left += size + h * 0.14;
      }
      const right = x + w - inset * 2;
      const size = fit(reg(title), h * 0.42, right - left);
      out.push({ t: 'text', x: (left + right) / 2, y: y + h / 2 + size * 0.36, text: title, size, color: WHITE, align: 'center' });
      break;
    }

    case 'text': {
      // Revu: título en negrita del color del sello y línea de fecha pequeña en gris oscuro
      if (def.bordered) out.push({ t: 'path', d: roundRect(x, y, w, h, 0), stroke: color, width: Math.max(0.8, h * 0.06) });
      const maxW = w * 0.92;
      if (subtitle) {
        const ts = fit(bold(title), h * 0.52, maxW);
        out.push({ t: 'text', x: x + w / 2, y: y + h * 0.56, text: title, size: ts, color, bold: true, align: 'center' });
        out.push({ t: 'text', x: x + w / 2, y: y + h * 0.86, text: subtitle, size: fit(reg(subtitle), h * 0.17, maxW), color: '#374151', align: 'center' });
      } else {
        const ts = fit(bold(title), h * 0.6, maxW);
        out.push({ t: 'text', x: x + w / 2, y: y + h / 2 + ts * 0.36, text: title, size: ts, color, bold: true, align: 'center' });
      }
      break;
    }

    case 'date': {
      const ts = fit(reg(title), h * 0.66, w * 0.94);
      out.push({ t: 'text', x: x + w / 2, y: y + h / 2 + ts * 0.36, text: title, size: ts, color, align: 'center' });
      break;
    }

    case 'proprietary': {
      const ts = fit(reg(title), h * 0.72, w * 0.96);
      out.push({ t: 'text', x: x + w / 2, y: y + h / 2 + ts * 0.36, text: title, size: ts, color, align: 'center' });
      break;
    }

    case 'watermark': {
      const ts = fit(bold(title), h * 0.72, w * 0.96);
      out.push({ t: 'text', x: x + w / 2, y: y + h / 2 + ts * 0.36, text: title, size: ts, color, bold: true, align: 'center' });
      break;
    }

    case 'tag': {
      // Etiqueta que apunta a la derecha (Right Pointing Tag de Revu): contorno oscuro y texto en cursiva negrita
      const tip = Math.min(h * 0.5, w * 0.3);
      out.push({
        t: 'path',
        d: `M ${f(x)} ${f(y)} L ${f(x + w - tip)} ${f(y)} L ${f(x + w)} ${f(y + h / 2)} L ${f(x + w - tip)} ${f(y + h)} L ${f(x)} ${f(y + h)} Z`,
        stroke: INK,
        width: Math.max(0.8, h * 0.05),
      });
      const ts = fit(bold(title), h * 0.46, w - tip - h * 0.4);
      out.push({ t: 'text', x: x + (w - tip) / 2 + h * 0.06, y: y + h / 2 + ts * 0.36, text: title, size: ts, color, bold: true, italic: true, align: 'center' });
      break;
    }

    case 'seal': {
      // Sello de ingeniero: doble anillo, rótulo arriba y renglones para el número y la firma
      const s = Math.min(w, h);
      const cx = x + w / 2;
      const cy = y + h / 2;
      const r = s * 0.48;
      out.push({ t: 'path', d: circle(cx, cy, r), stroke: color, width: Math.max(0.8, s * 0.035) });
      out.push({ t: 'path', d: circle(cx, cy, r * 0.74), stroke: color, width: Math.max(0.5, s * 0.02) });
      const ls = r * 0.36;
      out.push({ t: 'path', d: `M ${f(cx - ls)} ${f(cy - r * 0.08)} L ${f(cx + ls)} ${f(cy - r * 0.08)} M ${f(cx - ls)} ${f(cy + r * 0.16)} L ${f(cx + ls)} ${f(cy + r * 0.16)} M ${f(cx - ls * 0.7)} ${f(cy + r * 0.4)} L ${f(cx + ls * 0.7)} ${f(cy + r * 0.4)}`, stroke: color, width: Math.max(0.4, s * 0.015) });
      out.push({ t: 'text', x: cx, y: cy - r * 0.3, text: title, size: fit(bold(title), s * 0.1, r * 1.1), color, bold: true, align: 'center' });
      break;
    }

    case 'released': {
      // Released de Revu: recuadro rojo con tres renglones (estado, autor y fecha)
      const [who = '', when = ''] = subtitle.split('\n');
      out.push({ t: 'path', d: roundRect(x, y, w, h, 0), stroke: color, width: Math.max(0.8, h * 0.035) });
      out.push({ t: 'path', d: `M ${f(x)} ${f(y + h / 3)} L ${f(x + w)} ${f(y + h / 3)} M ${f(x)} ${f(y + (2 * h) / 3)} L ${f(x + w)} ${f(y + (2 * h) / 3)}`, stroke: color, width: Math.max(0.5, h * 0.02) });
      const pad = h * 0.08;
      const row = (i: number) => y + (h / 3) * i + h / 3 / 2 + h * 0.06;
      out.push({ t: 'text', x: x + pad, y: row(0), text: title, size: fit(bold(title), h * 0.2, w - pad * 2), color, bold: true, align: 'left' });
      out.push({ t: 'text', x: x + pad, y: row(1), text: `By: ${who}`, size: fit(reg(`By: ${who}`), h * 0.17, w - pad * 2), color, align: 'left' });
      out.push({ t: 'text', x: x + pad, y: row(2), text: `Date: ${when}`, size: fit(reg(`Date: ${when}`), h * 0.17, w - pad * 2), color, align: 'left' });
      break;
    }

    default: {
      // Obra (ADR-0040): marco único redondeado, título en negrita y "By … at …" en cursiva
      const L = stampLayout(box, title, subtitle);
      out.push({ t: 'path', d: roundRect(x, y, w, h, L.radius), stroke: color, width: L.outerStroke });
      out.push({ t: 'text', x: L.titleBaseline.x, y: L.titleBaseline.y, text: title, size: L.titleSize, color, bold: true, align: 'center' });
      if (L.subBaseline && subtitle) {
        out.push({ t: 'text', x: L.subBaseline.x, y: L.subBaseline.y, text: subtitle, size: L.subSize, color, italic: true, align: 'center' });
      }
    }
  }
  return out;
}
