import React, { useEffect, useRef, useState } from 'react';
import { useOverlayStore } from '../../store/useOverlayStore';
import { hexToRgb, tintOverlay } from '../../core/compare/overlayTint';
import { loadPdfDocument } from '../../services/pdfService';
import { showToast } from '../../services/toastService';

/**
 * Capa de Overlay Pages (ADR-0038) sobre la página activa: dibuja la página actual y la comparada, teñidas y
 * combinadas, a la misma escala y rotación que el visor. Las marcas quedan por encima (las dibuja el visor).
 */

interface PdfPageLike {
  rotate: number;
  getViewport: (o: { scale: number; rotation: number }) => { width: number; height: number; transform: number[] };
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> };
}
interface PdfDocLike {
  numPages: number;
  getPage: (n: number) => Promise<PdfPageLike>;
  destroy?: () => Promise<void>;
}

/** Píxeles RGBA de una página dibujada en un lienzo de `w`×`h` px, desplazada `dx`,`dy` px. */
async function renderPagePixels(
  doc: PdfDocLike,
  pageIndex: number,
  scale: number,
  viewRotation: number,
  w: number,
  h: number,
  dx = 0,
  dy = 0,
  matrix: [number, number, number, number] = [1, 0, 0, 1]
): Promise<Uint8ClampedArray> {
  const page = await doc.getPage(pageIndex + 1);
  const rotation = (((page.rotate + viewRotation) % 360) + 360) % 360;
  const viewport = page.getViewport({ scale, rotation });
  const pageCanvas = document.createElement('canvas');
  pageCanvas.width = Math.max(1, Math.round(viewport.width));
  pageCanvas.height = Math.max(1, Math.round(viewport.height));
  const pctx = pageCanvas.getContext('2d')!;
  pctx.fillStyle = '#ffffff';
  pctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
  await page.render({ canvasContext: pctx, viewport }).promise;
  // Mismo tamaño que la página activa; la comparada puede ser de otro tamaño o estar desplazada
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  // Alineación por puntos (ADR-0050): parte lineal y desplazamiento en píxeles de la página actual
  ctx.setTransform(matrix[0], matrix[1], matrix[2], matrix[3], dx, dy);
  ctx.drawImage(pageCanvas, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return ctx.getImageData(0, 0, w, h).data;
}

export const OverlayCanvas: React.FC<{
  pdfDoc: unknown;
  pageIndex: number;
  scale: number;
  rotation: number;
  width: number;
  height: number;
}> = ({ pdfDoc, pageIndex, scale, rotation, width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { sourceBytes, otherPageIndex, baseColor, otherColor, offset, showBase, showOther, matrix } = useOverlayStore();
  const [otherDoc, setOtherDoc] = useState<PdfDocLike | null>(null);

  // Documento comparado: el propio o el PDF elegido (se libera al cambiar o cerrar)
  useEffect(() => {
    if (!sourceBytes) {
      setOtherDoc(pdfDoc as PdfDocLike);
      return;
    }
    let cancelled = false;
    let loaded: PdfDocLike | null = null;
    loadPdfDocument(sourceBytes)
      .then((doc) => {
        loaded = doc as unknown as PdfDocLike;
        if (cancelled) void loaded.destroy?.();
        else setOtherDoc(loaded);
      })
      .catch((err) => {
        console.error('[Overlay] No se pudo cargar el PDF comparado:', err);
        showToast('Could not load the PDF to overlay.');
      });
    return () => {
      cancelled = true;
      if (loaded) void loaded.destroy?.();
    };
  }, [sourceBytes, pdfDoc]);

  useEffect(() => {
    const doc = pdfDoc as PdfDocLike | null;
    if (!doc || !otherDoc || typeof doc.getPage !== 'function' || !(width > 0) || !(height > 0)) return;
    let cancelled = false;
    const w = Math.round(width);
    const h = Math.round(height);
    Promise.all([
      showBase ? renderPagePixels(doc, pageIndex, scale, rotation, w, h) : Promise.resolve(null),
      showOther && otherPageIndex < otherDoc.numPages
        ? renderPagePixels(otherDoc, otherPageIndex, scale, rotation, w, h, offset.x * scale, offset.y * scale, matrix)
        : Promise.resolve(null),
    ])
      .then(([base, other]) => {
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        canvas.width = w;
        canvas.height = h;
        const pixels = tintOverlay(w, h, base, other, hexToRgb(baseColor), hexToRgb(otherColor));
        const ctx = canvas.getContext('2d')!;
        const image = ctx.createImageData(w, h);
        image.data.set(pixels);
        ctx.putImageData(image, 0, 0);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[Overlay] No se pudo dibujar la comparación:', err);
        showToast('Could not draw the overlay for this page.');
      });
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, otherDoc, pageIndex, scale, rotation, width, height, otherPageIndex, baseColor, otherColor, offset.x, offset.y, showBase, showOther, matrix]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="overlay-canvas"
      className="absolute inset-0 pointer-events-none"
      style={{ width: `${width}px`, height: `${height}px` }}
    />
  );
};

export default OverlayCanvas;
