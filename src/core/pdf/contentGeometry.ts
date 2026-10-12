/**
 * Geometría vectorial del plano para "Snap to Content" (ADR-0031), como en Revu: los trazos que dibuja la página
 * (líneas, rectángulos y curvas de la lista de operadores de PDF.js) pasan a segmentos en coordenadas normalizadas
 * de la vista. Puro salvo `extractPageSegments`, que solo pide la lista de operadores a PDF.js.
 */

/** Códigos de operador de PDF.js que se usan aquí (subconjunto de `OPS`). */
export interface PathOps {
  save: number;
  restore: number;
  transform: number;
  paintFormXObjectBegin: number;
  paintFormXObjectEnd: number;
  constructPath: number;
  moveTo: number;
  lineTo: number;
  curveTo: number;
  curveTo2: number;
  curveTo3: number;
  closePath: number;
  rectangle: number;
  stroke: number;
  closeStroke: number;
  fill: number;
  eoFill: number;
  fillStroke: number;
  eoFillStroke: number;
  closeFillStroke: number;
  closeEOFillStroke: number;
}

type Matrix = [number, number, number, number, number, number];

/** Límite de segmentos por página: protege la memoria en planos con tramas muy densas. */
export const MAX_CONTENT_SEGMENTS = 400_000;

/** Composición de matrices de PDF (aplica `m` y después `base`), igual que `Util.transform` de PDF.js. */
function multiply(base: Matrix, m: Matrix): Matrix {
  return [
    base[0] * m[0] + base[2] * m[1],
    base[1] * m[0] + base[3] * m[1],
    base[0] * m[2] + base[2] * m[3],
    base[1] * m[2] + base[3] * m[3],
    base[0] * m[4] + base[2] * m[5] + base[4],
    base[1] * m[4] + base[3] * m[5] + base[5],
  ];
}

/**
 * Segmentos [x1, y1, x2, y2, …] normalizados (0..1 sobre la vista) de los trazos pintados. `viewTransform` es la
 * matriz del viewport de PDF.js a escala 1 (incluye la rotación) y `viewW`/`viewH`, su tamaño. Los trazados que
 * solo recortan (sin pintar) se descartan; las curvas se aproximan por su cuerda.
 */
export function segmentsFromOperatorList(
  opList: { fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> },
  ops: PathOps,
  viewTransform: Matrix,
  viewW: number,
  viewH: number,
  maxSegments = MAX_CONTENT_SEGMENTS
): Float32Array {
  const out: number[] = [];
  const stack: Matrix[] = [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  let pending: number[] = [];
  const paintOps = new Set([
    ops.stroke,
    ops.closeStroke,
    ops.fill,
    ops.eoFill,
    ops.fillStroke,
    ops.eoFillStroke,
    ops.closeFillStroke,
    ops.closeEOFillStroke,
  ]);
  const flush = (keep: boolean) => {
    if (keep) {
      for (let k = 0; k < pending.length && out.length < maxSegments * 4; k++) out.push(pending[k]);
    }
    pending = [];
  };

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i] as unknown[] | null;
    if (fn === ops.constructPath) {
      // Un trazado sin pintar seguido de otro: el anterior era solo recorte
      flush(false);
      const pathOps = (args?.[0] ?? []) as ArrayLike<number>;
      const coords = (args?.[1] ?? []) as ArrayLike<number>;
      const m = multiply(viewTransform, ctm);
      const map = (x: number, y: number): [number, number] => [
        (m[0] * x + m[2] * y + m[4]) / viewW,
        (m[1] * x + m[3] * y + m[5]) / viewH,
      ];
      let j = 0;
      let cx = 0;
      let cy = 0;
      let sx = 0;
      let sy = 0;
      const seg = (x1: number, y1: number, x2: number, y2: number) => {
        if (x1 === x2 && y1 === y2) return;
        const [a, b] = map(x1, y1);
        const [c, d] = map(x2, y2);
        pending.push(a, b, c, d);
      };
      for (let k = 0; k < pathOps.length; k++) {
        const op = pathOps[k];
        if (op === ops.moveTo) {
          cx = sx = coords[j++];
          cy = sy = coords[j++];
        } else if (op === ops.lineTo) {
          const x = coords[j++];
          const y = coords[j++];
          seg(cx, cy, x, y);
          cx = x;
          cy = y;
        } else if (op === ops.curveTo) {
          const x = coords[j + 4];
          const y = coords[j + 5];
          j += 6;
          seg(cx, cy, x, y);
          cx = x;
          cy = y;
        } else if (op === ops.curveTo2 || op === ops.curveTo3) {
          const x = coords[j + 2];
          const y = coords[j + 3];
          j += 4;
          seg(cx, cy, x, y);
          cx = x;
          cy = y;
        } else if (op === ops.rectangle) {
          const x = coords[j++];
          const y = coords[j++];
          const w = coords[j++];
          const h = coords[j++];
          seg(x, y, x + w, y);
          seg(x + w, y, x + w, y + h);
          seg(x + w, y + h, x, y + h);
          seg(x, y + h, x, y);
          cx = sx = x;
          cy = sy = y;
        } else if (op === ops.closePath) {
          seg(cx, cy, sx, sy);
          cx = sx;
          cy = sy;
        }
      }
    } else if (paintOps.has(fn)) {
      flush(true);
    } else if (fn === ops.save) {
      stack.push(ctm);
    } else if (fn === ops.restore) {
      ctm = stack.pop() ?? ctm;
    } else if (fn === ops.transform) {
      ctm = multiply(ctm, (args ?? [1, 0, 0, 1, 0, 0]) as Matrix);
    } else if (fn === ops.paintFormXObjectBegin) {
      stack.push(ctm);
      const matrix = args?.[0] as Matrix | null | undefined;
      if (Array.isArray(matrix) || ArrayBuffer.isView(matrix)) ctm = multiply(ctm, Array.from(matrix as ArrayLike<number>) as Matrix);
    } else if (fn === ops.paintFormXObjectEnd) {
      ctm = stack.pop() ?? ctm;
    } else if (pending.length > 0) {
      // Cualquier otro operador tras el trazado (recorte, endPath): no se pintó
      flush(false);
    }
  }
  return new Float32Array(out);
}

interface PdfPageLike {
  rotate: number;
  getViewport: (o: { scale: number; rotation: number }) => { width: number; height: number; transform: number[] };
  getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[] }>;
}

/** Segmentos de una página de PDF.js con la rotación de vista indicada (se suma a la propia de la página). */
export async function extractPageSegments(
  page: PdfPageLike,
  viewRotation: number,
  ops: PathOps
): Promise<Float32Array> {
  const rotation = (((page.rotate + viewRotation) % 360) + 360) % 360;
  const vp = page.getViewport({ scale: 1, rotation });
  const opList = await page.getOperatorList();
  return segmentsFromOperatorList(opList, ops, vp.transform as Matrix, vp.width, vp.height);
}
