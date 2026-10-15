/**
 * Sincronización de la vista lado a lado (ADR-0049). Puro: trabaja con rectángulos en píxeles de pantalla.
 */

export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Punto de la página (0..1) que está en el centro del área visible del contenedor. */
export function viewCenterOnPage(container: RectLike, page: RectLike): { nx: number; ny: number } | null {
  if (!(page.width > 0) || !(page.height > 0)) return null;
  const cx = container.left + container.width / 2;
  const cy = container.top + container.height / 2;
  return { nx: (cx - page.left) / page.width, ny: (cy - page.top) / page.height };
}

/**
 * Desplazamiento que deja el punto (nx, ny) de la página en el centro del contenedor. `pageOffset` es la posición
 * de la página dentro del contenido desplazable (su margen); el resultado se limita al rango desplazable.
 */
export function scrollToCenter(
  nx: number,
  ny: number,
  page: { width: number; height: number },
  pageOffset: { x: number; y: number },
  client: { width: number; height: number },
  scrollSize: { width: number; height: number }
): { left: number; top: number } {
  const clamp = (v: number, max: number) => Math.max(0, Math.min(Math.max(0, max), v));
  return {
    left: clamp(pageOffset.x + nx * page.width - client.width / 2, scrollSize.width - client.width),
    top: clamp(pageOffset.y + ny * page.height - client.height / 2, scrollSize.height - client.height),
  };
}
