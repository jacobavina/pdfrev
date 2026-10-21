import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { PageCanvas } from './PageCanvas';
import { MAX_CANVAS_DIM_PX } from '../../core/render/tilePlan';

const renderMock = vi.fn();
vi.mock('../../services/pdfService', () => ({
  renderPageToCanvas: (...args: unknown[]) => renderMock(...args),
}));

const sizes = { w: 0, h: 0 };

describe('Renderizado por región a zoom máximo (ADR-0090)', () => {
  beforeEach(() => {
    renderMock.mockReset();
    renderMock.mockResolvedValue({ width: 21600, height: 14400, hasText: true });
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(() => sizes.w);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => sizes.h);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const isContainer = this.dataset.testid === 'pdf-viewer-container';
      const r = isContainer ? { left: 0, top: 0, width: 1200, height: 800 } : { left: -3000, top: -2000, width: sizes.w, height: sizes.h };
      return { ...r, x: r.left, y: r.top, right: r.left + r.width, bottom: r.top + r.height, toJSON: () => r } as DOMRect;
    });
  });
  afterEach(() => vi.restoreAllMocks());

  const mount = () =>
    render(
      <div data-testid="pdf-viewer-container">
        <div>
          <PageCanvas
            pdfDoc={{} as never}
            pageIndex={0}
            scale={6}
            rotation={0}
            active={false}
            shouldRender
            textLayerNode={null}
            onRendered={() => {}}
          />
        </div>
      </div>
    );

  it('en una hoja E-size a 600% de zoom renderiza la región visible sin superar el área máxima de canvas ni quedar en blanco', async () => {
    sizes.w = 21600;
    sizes.h = 14400;
    await act(async () => {
      mount();
    });
    expect(renderMock).toHaveBeenCalled();
    const opts = renderMock.mock.calls.at(-1)![3] as { region?: { x: number; y: number; width: number; height: number } };
    expect(opts.region).toBeDefined();
    const r = opts.region!;
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
    expect(r.width).toBeLessThanOrEqual(MAX_CANVAS_DIM_PX);
    expect(r.height).toBeLessThanOrEqual(MAX_CANVAS_DIM_PX);
    // La hoja asoma 3000 px por la izquierda y 2000 por arriba: la región cubre lo visible (3000..4200, 2000..2800)
    expect(r.x).toBeLessThanOrEqual(3000);
    expect(r.x + r.width).toBeGreaterThanOrEqual(4200);
    expect(r.y).toBeLessThanOrEqual(2000);
    expect(r.y + r.height).toBeGreaterThanOrEqual(2800);
  });

  it('una hoja que cabe en un canvas se renderiza entera, sin región', async () => {
    sizes.w = 1200;
    sizes.h = 800;
    await act(async () => {
      mount();
    });
    expect(renderMock).toHaveBeenCalled();
    expect((renderMock.mock.calls.at(-1)![3] as { region?: unknown }).region).toBeUndefined();
  });
});
