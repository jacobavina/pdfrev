import { describe, it, expect } from 'vitest';
import { wrapCalloutText, estimateCalloutBoxNormalizedSize, getHelveticaTextWidth } from './render';

describe('Envoltura del texto del callout con ruido de coma flotante', () => {
  it('una caja medida justo al texto no lo parte en dos líneas aunque su ancho cambie en el último decimal', () => {
    const w = getHelveticaTextWidth('Cloud+ note', 10);
    expect(wrapCalloutText('Cloud+ note', w, 10)).toEqual(['Cloud+ note']);
    expect(wrapCalloutText('Cloud+ note', w - 1e-9, 10)).toEqual(['Cloud+ note']);
    // Una caja claramente más estrecha sí lo parte
    expect(wrapCalloutText('Cloud+ note', w - 5, 10)).toEqual(['Cloud+', 'note']);
    // Mover la nota no cambia su caja: el ancho estimado menos el margen sigue alojando el texto
    const size = estimateCalloutBoxNormalizedSize('Cloud+ note', 10, 800, 600);
    const moved = size.width * 800 + 0.33 - 0.33;
    expect(wrapCalloutText('Cloud+ note', moved - 16, 10)).toHaveLength(1);
  });
});
