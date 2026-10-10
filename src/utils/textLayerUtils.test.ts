import { describe, it, expect } from 'vitest';
import { extractTextForLineRect, mergeLineRects } from './textLayerUtils';

describe('textLayerUtils: extractTextForLineRect', () => {
  it('retorna range.toString() si solo hay una línea (allRects <= 1)', () => {
    const range = {
      toString: () => 'PLANO DE PRUEBA',
      getClientRects: () => [{ width: 100, height: 20 }] as unknown as DOMRectList,
    } as unknown as Range;

    const dummyRect = {
      left: 10,
      right: 110,
      top: 20,
      bottom: 40,
      width: 100,
      height: 20,
    } as DOMRect;

    const result = extractTextForLineRect(dummyRect, range, null);
    expect(result).toBe('PLANO DE PRUEBA');
  });

  it('extrae el texto específico de la línea que intersecta verticalmente con sus spans', () => {
    // Contenedor simulado con 3 spans en diferentes líneas Y
    const container = document.createElement('div');

    const span1 = document.createElement('span');
    span1.textContent = 'PRIMERA LÍNEA';
    span1.getBoundingClientRect = () =>
      ({ left: 50, right: 200, top: 100, bottom: 120, width: 150, height: 20 } as DOMRect);

    const span2 = document.createElement('span');
    span2.textContent = 'SEGUNDA LÍNEA';
    span2.getBoundingClientRect = () =>
      ({ left: 50, right: 210, top: 130, bottom: 150, width: 160, height: 20 } as DOMRect);

    const span3 = document.createElement('span');
    span3.textContent = 'TERCERA LÍNEA';
    span3.getBoundingClientRect = () =>
      ({ left: 50, right: 205, top: 160, bottom: 180, width: 155, height: 20 } as DOMRect);

    container.appendChild(span1);
    container.appendChild(span2);
    container.appendChild(span3);

    const rect1 = { left: 50, right: 200, top: 100, bottom: 120, width: 150, height: 20 } as DOMRect;
    const rect2 = { left: 50, right: 210, top: 130, bottom: 150, width: 160, height: 20 } as DOMRect;
    const rect3 = { left: 50, right: 205, top: 160, bottom: 180, width: 155, height: 20 } as DOMRect;

    const range = {
      toString: () => 'PRIMERA LÍNEA SEGUNDA LÍNEA TERCERA LÍNEA',
      getClientRects: () => [rect1, rect2, rect3] as unknown as DOMRectList,
      intersectsNode: (node: Node) => [span1, span2, span3].includes(node as HTMLElement),
      startContainer: span1.firstChild || span1,
      startOffset: 0,
      endContainer: span3.firstChild || span3,
      endOffset: span3.textContent!.length,
    } as unknown as Range;

    const textL1 = extractTextForLineRect(rect1, range, container);
    const textL2 = extractTextForLineRect(rect2, range, container);
    const textL3 = extractTextForLineRect(rect3, range, container);

    expect(textL1).toBe('PRIMERA LÍNEA');
    expect(textL2).toBe('SEGUNDA LÍNEA');
    expect(textL3).toBe('TERCERA LÍNEA');
  });

  it('ordena fragmentos de izquierda a derecha si una línea contiene múltiples spans', () => {
    const container = document.createElement('div');

    const spanA = document.createElement('span');
    spanA.textContent = 'MÚLTIPLES';
    spanA.getBoundingClientRect = () =>
      ({ left: 50, right: 120, top: 100, bottom: 120, width: 70, height: 20 } as DOMRect);

    const spanB = document.createElement('span');
    spanB.textContent = 'SPANS';
    spanB.getBoundingClientRect = () =>
      ({ left: 130, right: 180, top: 100, bottom: 120, width: 50, height: 20 } as DOMRect);

    // Añadir en orden desordenado al DOM
    container.appendChild(spanB);
    container.appendChild(spanA);

    const rect = { left: 50, right: 180, top: 100, bottom: 120, width: 130, height: 20 } as DOMRect;
    const dummyOtherRect = { left: 50, right: 180, top: 140, bottom: 160, width: 130, height: 20 } as DOMRect;

    const range = {
      toString: () => 'MÚLTIPLES SPANS',
      getClientRects: () => [rect, dummyOtherRect] as unknown as DOMRectList,
      intersectsNode: () => true,
      startContainer: null,
      startOffset: 0,
      endContainer: null,
      endOffset: 0,
    } as unknown as Range;

    const text = extractTextForLineRect(rect, range, container);
    expect(text).toBe('MÚLTIPLES SPANS');
  });
});

describe('textLayerUtils: mergeLineRects', () => {
  it('fusiona múltiples rectángulos en la misma línea en exactamente un rectángulo de línea', () => {
    const word1 = { left: 50, right: 120, top: 100, bottom: 120, width: 70, height: 20 };
    const word2 = { left: 130, right: 200, top: 101, bottom: 121, width: 70, height: 20 };
    const word3 = { left: 210, right: 300, top: 99, bottom: 119, width: 90, height: 20 };

    const merged = mergeLineRects([word1, word2, word3]);
    expect(merged).toHaveLength(1);
    expect(merged[0].left).toBe(50);
    expect(merged[0].right).toBe(300);
    expect(merged[0].width).toBe(250);
    expect(merged[0].top).toBe(99);
    expect(merged[0].bottom).toBe(121);
  });

  it('separa rectángulos en líneas visuales distintas en N rectángulos', () => {
    const line1Word1 = { left: 50, right: 120, top: 100, bottom: 120, width: 70, height: 20 };
    const line1Word2 = { left: 130, right: 200, top: 100, bottom: 120, width: 70, height: 20 };
    const line2Word1 = { left: 50, right: 180, top: 140, bottom: 160, width: 130, height: 20 };

    const merged = mergeLineRects([line1Word1, line1Word2, line2Word1]);
    expect(merged).toHaveLength(2);
    expect(merged[0].width).toBe(150);
    expect(merged[1].width).toBe(130);
  });

  it('descarta rectángulos microscópicos o vacíos (width/height <= 0.5)', () => {
    const empty = { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
    expect(mergeLineRects([empty])).toHaveLength(0);
  });
});
