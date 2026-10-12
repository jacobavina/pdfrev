import { MarkupPoint } from '../../types/markup';

/**
 * Índice espacial de los segmentos del plano (ADR-0031): una rejilla uniforme sobre la página normalizada, para
 * que el snap consulte solo los segmentos cercanos al cursor aunque el plano tenga cientos de miles.
 */
export class ContentSnapIndex {
  readonly segments: Float32Array;
  private readonly n: number;
  private readonly cellStart: Uint32Array;
  private readonly cellItems: Uint32Array;
  private stamp: Uint32Array;
  private stampValue = 0;

  constructor(segments: Float32Array, gridSize = 128) {
    this.segments = segments;
    this.n = gridSize;
    const count = segments.length / 4;
    const cells = gridSize * gridSize;
    const cellOf = (v: number) => Math.max(0, Math.min(gridSize - 1, Math.floor(v * gridSize)));
    // Dos pasadas: contar y después colocar (sin arrays por celda)
    const counts = new Uint32Array(cells + 1);
    const forEachCell = (i: number, fn: (c: number) => void) => {
      const x0 = cellOf(Math.min(segments[i * 4], segments[i * 4 + 2]));
      const x1 = cellOf(Math.max(segments[i * 4], segments[i * 4 + 2]));
      const y0 = cellOf(Math.min(segments[i * 4 + 1], segments[i * 4 + 3]));
      const y1 = cellOf(Math.max(segments[i * 4 + 1], segments[i * 4 + 3]));
      for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) fn(gy * gridSize + gx);
    };
    for (let i = 0; i < count; i++) forEachCell(i, (c) => counts[c + 1]++);
    for (let c = 0; c < cells; c++) counts[c + 1] += counts[c];
    this.cellStart = counts;
    this.cellItems = new Uint32Array(counts[cells]);
    const fill = counts.slice(0, cells);
    for (let i = 0; i < count; i++) forEachCell(i, (c) => (this.cellItems[fill[c]++] = i));
    this.stamp = new Uint32Array(count);
  }

  get size(): number {
    return this.segments.length / 4;
  }

  /** Segmentos cuya caja cae en las celdas dentro de ±rx/±ry (normalizado) del punto. */
  near(pt: MarkupPoint, rx: number, ry: number): [MarkupPoint, MarkupPoint][] {
    const g = this.n;
    const cellOf = (v: number) => Math.max(0, Math.min(g - 1, Math.floor(v * g)));
    const x0 = cellOf(pt.x - rx);
    const x1 = cellOf(pt.x + rx);
    const y0 = cellOf(pt.y - ry);
    const y1 = cellOf(pt.y + ry);
    this.stampValue++;
    if (this.stampValue === 0xffffffff) {
      this.stamp.fill(0);
      this.stampValue = 1;
    }
    const s = this.segments;
    const out: [MarkupPoint, MarkupPoint][] = [];
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const c = gy * g + gx;
        for (let k = this.cellStart[c]; k < this.cellStart[c + 1]; k++) {
          const i = this.cellItems[k];
          if (this.stamp[i] === this.stampValue) continue;
          this.stamp[i] = this.stampValue;
          out.push([
            { x: s[i * 4], y: s[i * 4 + 1] },
            { x: s[i * 4 + 2], y: s[i * 4 + 3] },
          ]);
        }
      }
    }
    return out;
  }
}
