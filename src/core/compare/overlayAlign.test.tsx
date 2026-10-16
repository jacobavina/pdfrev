import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { applyAffine, describeLinear, invertAffine, solveAlignment, Linear, Pt } from './overlayAlign';
import { useOverlayStore } from '../../store/useOverlayStore';
import { OverlayBar } from '../../components/viewer/OverlayBar';

const close = (a: Pt, b: Pt) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
};

describe('Alineación por puntos de Overlay Pages (ADR-0050)', () => {
  beforeEach(() => {
    useOverlayStore.getState().close();
    useOverlayStore.getState().start({ name: 'Rev B.pdf', bytes: null, pageCount: 2 });
  });

  it('con 2 pares recupera desplazamiento, giro y escala; con 3, también la deformación', () => {
    // Revisión girada 3°, escalada ×1.02 y desplazada (40, −12) pt
    const th = (3 * Math.PI) / 180;
    const m: Linear = [1.02 * Math.cos(th), 1.02 * Math.sin(th), -1.02 * Math.sin(th), 1.02 * Math.cos(th)];
    const t = { x: 40, y: -12 };
    const other = [{ x: 100, y: 120 }, { x: 600, y: 450 }];
    const base = other.map((p) => applyAffine(m, t, p));
    const s = solveAlignment(base, other)!;
    close(applyAffine(s.matrix, s.offset, { x: 300, y: 200 }), applyAffine(m, t, { x: 300, y: 200 }));
    expect(describeLinear(s.matrix).scale).toBeCloseTo(1.02, 9);
    expect(describeLinear(s.matrix).rotationDeg).toBeCloseTo(3, 9);
    // Escaneo estirado en x y sesgado: solo 3 pares lo corrigen
    const skew: Linear = [1.05, 0.01, 0.03, 0.98];
    const o3 = [{ x: 50, y: 60 }, { x: 700, y: 80 }, { x: 120, y: 520 }];
    const s3 = solveAlignment(o3.map((p) => applyAffine(skew, t, p)), o3)!;
    close(applyAffine(s3.matrix, s3.offset, { x: 400, y: 300 }), applyAffine(skew, t, { x: 400, y: 300 }));
    // Puntos repetidos o en línea: no sirven
    expect(solveAlignment([{ x: 1, y: 1 }, { x: 5, y: 5 }], [{ x: 2, y: 2 }, { x: 2, y: 2 }])).toBeNull();
    expect(solveAlignment(o3, [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }])).toBeNull();
    close(invertAffine(m, t, applyAffine(m, t, { x: 7, y: 9 }))!, { x: 7, y: 9 });
  });

  it('el clic alterna entre página actual y comparada, y con el tercer par se aplica sola', () => {
    const o = () => useOverlayStore.getState();
    o().nudge(10, 0); // desplazamiento previo: el punto de la comparada se toma deshaciéndolo
    o().startAlign();
    o().addAlignPoint({ x: 100, y: 100 });
    o().addAlignPoint({ x: 110, y: 100 }); // el dibujo comparado se ve 10 pt a la derecha → su punto real es (100, 100)
    expect(o().align.other[0]).toEqual({ x: 100, y: 100 });
    o().addAlignPoint({ x: 500, y: 100 });
    o().addAlignPoint({ x: 510, y: 100 });
    o().addAlignPoint({ x: 100, y: 400 });
    o().addAlignPoint({ x: 110, y: 400 });
    // Se aplicó: los puntos de la comparada caen sobre los de la página actual (desplazamiento 0)
    expect(o().align.picking).toBe(false);
    expect(o().offset).toEqual({ x: 0, y: 0 });
    close(applyAffine(o().matrix, o().offset, { x: 500, y: 100 }), { x: 500, y: 100 });
    // Reset vuelve al plano sin alinear
    o().resetOffset();
    expect(o().matrix).toEqual([1, 0, 0, 1]);
  });

  it('la barra guía punto a punto, aplica con 2 pares y muestra escala y giro', () => {
    render(<OverlayBar />);
    fireEvent.click(screen.getByTestId('overlay-align'));
    expect(screen.getByTestId('overlay-align-steps')).toHaveTextContent('Point 1 on the current page');
    act(() => useOverlayStore.getState().addAlignPoint({ x: 0, y: 0 }));
    expect(screen.getByTestId('overlay-align-steps')).toHaveTextContent('Point 1 on the compared page');
    act(() => useOverlayStore.getState().addAlignPoint({ x: 0, y: 0 }));
    expect(screen.getByTestId('overlay-align-apply')).toBeDisabled();
    act(() => useOverlayStore.getState().addAlignPoint({ x: 100, y: 0 }));
    act(() => useOverlayStore.getState().addAlignPoint({ x: 0, y: 50 }));
    fireEvent.click(screen.getByTestId('overlay-align-apply'));
    // (0, 50) de la comparada sobre (100, 0) de la actual: escala ×2 y giro de −90° (y hacia abajo)
    expect(screen.getByTestId('overlay-offset')).toHaveTextContent('×2.000 · -90.00°');
    fireEvent.click(screen.getByTestId('overlay-align'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useOverlayStore.getState().align.picking).toBe(false);
  });
});
