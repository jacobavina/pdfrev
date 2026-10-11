import { describe, it, expect } from 'vitest';
import {
  getEllipseGeometry,
  getRectGeometry,
  pointsToSvgPointsString,
  pointsToFreehandPathD,
  generateCloudPath,
  getMarkupSvgDescriptor,
  normalizeSvgAttrs,
  renderSvgDescriptor,
  calculateSignedArea,
  DEFAULT_ARC_STEP,
  MIN_SAGITTA,
  calculateCalloutGeometry,
  estimateCalloutBoxNormalizedSize,
  CALLOUT_ARROW_SIZE,
  CALLOUT_MIN_BOX_WIDTH,
} from './render';
import { Markup, HIGHLIGHT_STYLE } from '../../types/markup';

describe('Pure Markup Rendering (src/core/markup/render.ts - Criterio 1)', () => {
  const transform = {
    width: 800,
    height: 600,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  };

  it('computes correct ellipse geometry from 2 points', () => {
    const ell = getEllipseGeometry({ x: 100, y: 150 }, { x: 500, y: 350 });
    expect(ell.cx).toBe(300);
    expect(ell.cy).toBe(250);
    expect(ell.rx).toBe(200);
    expect(ell.ry).toBe(100);
  });

  it('computes correct rectangle geometry from 2 points', () => {
    const rect = getRectGeometry({ x: 300, y: 200 }, { x: 100, y: 50 });
    expect(rect.x).toBe(100);
    expect(rect.y).toBe(50);
    expect(rect.width).toBe(200);
    expect(rect.height).toBe(150);
  });

  it('generates polygon points string in screen coordinates', () => {
    const points = [
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.1 },
      { x: 0.3, y: 0.5 },
    ];
    const str = pointsToSvgPointsString(points, transform);
    // 0.1*800=80, 0.1*600=60, 0.5*800=400, 0.3*800=240, 0.5*600=300
    expect(str).toBe('80.00,60.00 400.00,60.00 240.00,300.00');
  });

  it('generates freehand path D string in screen coordinates', () => {
    const points = [
      { x: 0.1, y: 0.2 },
      { x: 0.2, y: 0.3 },
    ];
    const pathD = pointsToFreehandPathD(points, transform);
    expect(pathD).toBe('M 80.00 120.00 L 160.00 180.00');
  });

  it('returns valid SVG descriptors for polygon and circle without DOM', () => {
    const polyMarkup: Markup = {
      id: 'poly-1',
      type: 'polygon',
      pageIndex: 0,
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.4, y: 0.1 },
        { x: 0.2, y: 0.4 },
      ],
      style: {
        strokeColor: '#00ff00',
        strokeWidth: 2,
        opacity: 1,
      },
      author: 'Tester',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'pending',
    };

    const polyDesc = getMarkupSvgDescriptor(polyMarkup, transform);
    expect(polyDesc.tag).toBe('polygon');
    expect(polyDesc.attrs.stroke).toBe('#00ff00');
    expect(polyDesc.attrs.points).toBe('80.00,60.00 320.00,60.00 160.00,240.00');

    const circleMarkup: Markup = {
      id: 'circle-1',
      type: 'circle',
      pageIndex: 0,
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.5, y: 0.5 },
      ],
      style: {
        strokeColor: '#ff0000',
        strokeWidth: 2,
        opacity: 1,
      },
      author: 'Tester',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'pending',
    };

    const circleDesc = getMarkupSvgDescriptor(circleMarkup, transform);
    expect(circleDesc.tag).toBe('ellipse');
    expect(circleDesc.attrs.cx).toBe(240); // (80 + 400) / 2
    expect(circleDesc.attrs.cy).toBe(180); // (60 + 300) / 2
    expect(circleDesc.attrs.rx).toBe(160);
    expect(circleDesc.attrs.ry).toBe(120);
  });

  it('C1: returns valid text descriptor with tag text (not path) and textNode', () => {
    const textMarkup: Markup = {
      id: 'text-1',
      type: 'text',
      pageIndex: 0,
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.3, y: 0.2 },
      ],
      style: {
        strokeColor: '#333333',
        strokeWidth: 1,
        opacity: 1,
      },
      text: 'Nota técnica de control',
      author: 'Revisor',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'pending',
    };

    const desc = getMarkupSvgDescriptor(textMarkup, transform);
    expect(desc.tag).toBe('g');
    expect(desc.children).toBeDefined();
    expect(desc.children).toHaveLength(2);
    expect(desc.children![0].tag).toBe('rect');
    expect(desc.children![1].tag).toBe('text');
    expect(desc.children![1].textNode).toBe('Nota técnica de control');
  });

  it('Condición 2: highlightVector usa HIGHLIGHT_STYLE como fuente única de verdad', () => {
    const hlMarkup: Markup = {
      id: 'hl-1',
      type: 'highlightVector',
      pageIndex: 0,
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.4, y: 0.3 },
      ],
      style: {
        strokeColor: '#000000',
        strokeWidth: 1,
        opacity: 1,
      },
      author: 'Revisor',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'pending',
    };

    const desc = getMarkupSvgDescriptor(hlMarkup, transform);
    expect(desc.tag).toBe('rect');
    expect(desc.attrs.fill).toBe(HIGHLIGHT_STYLE.colorHex);
    expect(desc.attrs.opacity).toBe(HIGHLIGHT_STYLE.opacity);
    expect(desc.style?.mixBlendMode).toBe(HIGHLIGHT_STYLE.mixBlendMode);
    expect(desc.attrs.stroke).toBe('transparent');
    expect(desc.attrs.strokeWidth).toBe(0);
  });

  it('highlightVector soporta trazo invertido (p1 bottom-right a p2 top-left) generando geometría positiva', () => {
    const invertedHl: Markup = {
      id: 'hl-inverted',
      type: 'highlightVector',
      pageIndex: 0,
      points: [
        { x: 0.5, y: 0.6 },
        { x: 0.2, y: 0.3 },
      ],
      style: {
        strokeColor: 'transparent',
        strokeWidth: 0,
        opacity: HIGHLIGHT_STYLE.opacity,
      },
      author: 'Revisor',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'pending',
    };

    const desc = getMarkupSvgDescriptor(invertedHl, transform);
    expect(desc.tag).toBe('rect');
    expect(desc.attrs.width).toBeGreaterThan(0);
    expect(desc.attrs.height).toBeGreaterThan(0);
    expect(desc.attrs.x).toBe(0.2 * transform.width);
    expect(desc.attrs.y).toBe(0.3 * transform.height);
  });

  it('C2: generateCloudPath operates in page space independently of zoom', () => {
    const p1 = { x: 0.1, y: 0.2 };
    const p2 = { x: 0.6, y: 0.7 };
    const pageSize = { width: 800, height: 600 };

    const path1 = generateCloudPath(p1, p2, pageSize, 20);
    expect(path1).toContain('M 80.00 120.00');
    expect(path1).toContain('Q');
    expect(path1).toContain('Z');
  });

  it('C1: normalizeSvgAttrs mapea claves kebab-case a camelCase para React.createElement', () => {
    const rawAttrs = {
      'stroke-width': 2,
      'stroke-dasharray': '4 4',
      'font-size': 14,
      'text-anchor': 'middle',
      'data-testid': 'markup-item',
      'aria-label': 'Anotación',
    };

    const normalized = normalizeSvgAttrs(rawAttrs);
    expect(normalized.strokeWidth).toBe(2);
    expect(normalized.strokeDasharray).toBe('4 4');
    expect(normalized.fontSize).toBe(14);
    expect(normalized.textAnchor).toBe('middle');
    // data-* y aria-* preservados
    expect(normalized['data-testid']).toBe('markup-item');
    expect(normalized['aria-label']).toBe('Anotación');
    // Las claves con guion fueron eliminadas de las propiedades directas
    expect(normalized['stroke-width']).toBeUndefined();
    expect(normalized['font-size']).toBeUndefined();
  });

  it('C1: renderSvgDescriptor produce React.createElement con props camelCase y sin warnings', () => {
    const desc = {
      tag: 'text' as const,
      attrs: {
        x: 10,
        y: 20,
        'font-size': 16,
        'stroke-width': 1.5,
        'text-anchor': 'start',
      },
      textNode: 'Texto de prueba',
    };

    const el = renderSvgDescriptor(desc, 'test-key');
    expect(el.props.fontSize).toBe(16);
    expect(el.props.strokeWidth).toBe(1.5);
    expect(el.props.textAnchor).toBe('start');
    expect(el.props['font-size']).toBeUndefined();
    expect(el.props['stroke-width']).toBeUndefined();
    expect(el.props['text-anchor']).toBeUndefined();
  });

  // --------------------------------------------------------------------------------
  // Sub-entregable A.1: Nubes de Revisión Poligonales, Lóbulos, Zoom Invariance y Cloud+
  // --------------------------------------------------------------------------------
  describe('Sub-entregable A.1: Cloud y CloudPlus Specs', () => {
    it('calculates signed area correctly (CW > 0, CCW < 0 in SVG space)', () => {
      expect(DEFAULT_ARC_STEP).toBe(20);
      // CW en SVG (Y hacia abajo): (0,0) -> (100,0) -> (100,100) -> (0,100)
      const cwPoints = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ];
      expect(calculateSignedArea(cwPoints)).toBeGreaterThan(0);

      // CCW en SVG: (0,0) -> (0,100) -> (100,100) -> (100,0)
      const ccwPoints = [
        { x: 0, y: 0 },
        { x: 0, y: 100 },
        { x: 100, y: 100 },
        { x: 100, y: 0 },
      ];
      expect(calculateSignedArea(ccwPoints)).toBeLessThan(0);
    });

    it('generates exact number of lobes per edge based on step Pt', () => {
      const pageSize = { width: 1000, height: 1000 };
      const step = 20;

      // Triángulo con aristas de longitudes conocidas:
      // A (0.1, 0.1) -> B (0.2, 0.1): dx = 100 pt, dy = 0 pt -> len = 100 pt -> 100/20 = 5 arcos
      // B (0.2, 0.1) -> C (0.2, 0.13): dx = 0 pt, dy = 30 pt -> len = 30 pt -> round(30/20) = 2 arcos
      // C (0.2, 0.13) -> A (0.1, 0.1): hipotenusa Math.hypot(100, 30) = 104.4 pt -> round(104.4/20) = 5 arcos
      const triangle = [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.1 },
        { x: 0.2, y: 0.13 },
      ];

      const d = generateCloudPath(triangle, pageSize, step);
      // Contar comandos Q en la cadena resultante
      const qMatches = d.match(/Q /g);
      expect(qMatches).not.toBeNull();
      // Total de arcos = 5 + 2 + 5 = 12
      expect(qMatches?.length).toBe(12);
    });

    it('enforces MIN_SAGITTA = 4 on short edges so arcs never become flat', () => {
      const pageSize = { width: 1000, height: 1000 };
      // Arista muy corta: 10 pt (0.01 * 1000)
      const shortPoly = [
        { x: 0.1, y: 0.1 },
        { x: 0.11, y: 0.1 }, // len = 10 pt
        { x: 0.11, y: 0.11 },
        { x: 0.1, y: 0.11 },
      ];

      const d = generateCloudPath(shortPoly, pageSize, 20);
      expect(d).toContain('Q');

      // Extraer coordenadas de control de la primera arista horizontal (de y=100)
      // Debe tener sagitta de al menos MIN_SAGITTA = 4 hacia arriba (Y <= 96)
      const match = d.match(/Q ([\d.]+) ([\d.]+)/);
      expect(match).not.toBeNull();
      const ctrlY = parseFloat(match![2]);
      // Si el punto base está en y=100, y el abombamiento exterior es hacia arriba (-sagitta):
      // ctrlY debe ser <= 100 - MIN_SAGITTA = 96
      expect(ctrlY).toBeLessThanOrEqual(100 - MIN_SAGITTA);
    });

    it('outward bulge is always directed outside the polygon for both CW and CCW orders', () => {
      const pageSize = { width: 800, height: 600 };
      const step = 25;

      // Cuadrado CW en coordenadas normalizadas (0.2 a 0.6 en X, 0.2 a 0.6 en Y)
      // X: 160 a 480 pt, Y: 120 a 360 pt
      const cwSquare = [
        { x: 0.2, y: 0.2 }, // Top-Left
        { x: 0.6, y: 0.2 }, // Top-Right
        { x: 0.6, y: 0.6 }, // Bottom-Right
        { x: 0.2, y: 0.6 }, // Bottom-Left
      ];

      const dCW = generateCloudPath(cwSquare, pageSize, step);
      // El borde superior va de (160, 120) a (480, 120). El exterior está en Y < 120.
      const firstQ_CW = dCW.match(/Q ([\d.]+) ([\d.]+)/);
      expect(firstQ_CW).not.toBeNull();
      const ctrlY_CW = parseFloat(firstQ_CW![2]);
      expect(ctrlY_CW).toBeLessThan(120); // Abomba hacia afuera (hacia arriba)

      // Cuadrado CCW invertido
      const ccwSquare = [
        { x: 0.2, y: 0.2 }, // Top-Left
        { x: 0.2, y: 0.6 }, // Bottom-Left
        { x: 0.6, y: 0.6 }, // Bottom-Right
        { x: 0.6, y: 0.2 }, // Top-Right
      ];

      const dCCW = generateCloudPath(ccwSquare, pageSize, step);
      // El primer borde va de (160, 120) a (160, 360) hacia abajo.
      // El exterior está a la izquierda (X < 160).
      const firstQ_CCW = dCCW.match(/Q ([\d.]+) ([\d.]+)/);
      expect(firstQ_CCW).not.toBeNull();
      const ctrlX_CCW = parseFloat(firstQ_CCW![1]);
      expect(ctrlX_CCW).toBeLessThan(160); // Abomba hacia afuera (hacia la izquierda)
    });

    it('preserves exact backward compatibility for 2-point rectangular clouds', () => {
      const p1 = { x: 0.1, y: 0.2 };
      const p2 = { x: 0.6, y: 0.7 };
      const pageSize = { width: 800, height: 600 };

      const legacyCall = generateCloudPath(p1, p2, pageSize, 20);
      const arrayCall = generateCloudPath([p1, p2], pageSize, 20);

      expect(legacyCall).toBe(arrayCall);
      expect(legacyCall).toContain('M 80.00 120.00');
    });

    it('ensures zoom invariance: number of lobes in SVG descriptor is identical across scale 1.0 and 2.5', () => {
      const cloudMarkup: Markup = {
        id: 'cloud-zoom',
        type: 'cloud',
        pageIndex: 0,
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.5, y: 0.1 },
          { x: 0.5, y: 0.5 },
          { x: 0.1, y: 0.5 },
        ],
        style: { strokeColor: '#10b981', strokeWidth: 2, opacity: 1 },
        customFields: { arcStep: 20 },
        author: 'Tester',
        createdAt: '',
        updatedAt: '',
        status: 'pending',
      };

      const desc1 = getMarkupSvgDescriptor(cloudMarkup, { ...transform, scale: 1.0 });
      const desc2 = getMarkupSvgDescriptor(cloudMarkup, { ...transform, scale: 2.5 });

      const d1 = desc1.attrs.d as string;
      const d2 = desc2.attrs.d as string;

      const lobes1 = d1.match(/Q /g)?.length;
      const lobes2 = d2.match(/Q /g)?.length;

      expect(lobes1).toBeDefined();
      expect(lobes2).toBeDefined();
      expect(lobes1).toBe(lobes2);
    });

    it('returns a complete SvgRenderDescriptor for callout markup (leader + text box)', () => {
      const calloutMarkup: Markup = {
        id: 'callout-1',
        type: 'callout',
        pageIndex: 0,
        points: [
          { x: 0.4, y: 0.2 },
          { x: 0.6, y: 0.28 },
        ],
        leaders: [[{ x: 0.35, y: 0.15 }]],
        style: { strokeColor: '#0284c7', strokeWidth: 1.5, opacity: 1, fillColor: '#ffffff' },
        text: 'Detalle de armadura',
        author: 'Ingeniero',
        createdAt: '',
        updatedAt: '',
        status: 'pending',
      };

      const desc = getMarkupSvgDescriptor(calloutMarkup, transform);
      expect(desc.tag).toBe('g');
      expect(desc.children).toBeDefined();

      const tags = desc.children?.map((c) => c.tag);
      expect(tags).toContain('polyline');
      expect(tags).toContain('polygon');
      expect(tags).toContain('rect');
      expect(tags).toContain('text');

      const textChild = desc.children?.find((c) => c.tag === 'text');
      expect(textChild?.textNode).toBe('Detalle de armadura');
    });

    describe('Sub-entregable A.3: Geometría de Callout, Codo Inteligente y Flechas en Unidades de Página', () => {
      it('calculateCalloutGeometry orienta el codo horizontalmente a la izquierda cuando el ancla está a la izquierda y a la derecha cuando está a la derecha', () => {
        const boxP1 = { x: 300, y: 200 };
        const boxP2 = { x: 400, y: 250 };

        // Caso 1: Ancla a la izquierda (x = 100 < 300)
        const leftGeom = calculateCalloutGeometry(boxP1, boxP2, [[{ x: 100, y: 150 }]], 1.0);
        expect(leftGeom.leaders[0].boxAttachment.x).toBe(300); // borde izquierdo
        expect(leftGeom.leaders[0].boxAttachment.y).toBe(225); // centro vertical
        expect(leftGeom.leaders[0].elbow.x).toBeLessThan(300); // codo quiebra hacia la izquierda
        expect(leftGeom.leaders[0].elbow.y).toBe(225); // hombro horizontal

        // Caso 2: Ancla a la derecha (x = 550 > 400)
        const rightGeom = calculateCalloutGeometry(boxP1, boxP2, [[{ x: 550, y: 280 }]], 1.0);
        expect(rightGeom.leaders[0].boxAttachment.x).toBe(400); // borde derecho
        expect(rightGeom.leaders[0].boxAttachment.y).toBe(225); // centro vertical
        expect(rightGeom.leaders[0].elbow.x).toBeGreaterThan(400); // codo quiebra hacia la derecha
        expect(rightGeom.leaders[0].elbow.y).toBe(225); // hombro horizontal
      });

      it('calculateCalloutGeometry mantiene el tamaño de la flecha proporcional a transform.scale en pantalla e invariante en puntos de página', () => {
        const boxP1 = { x: 300, y: 200 };
        const boxP2 = { x: 400, y: 250 };
        const leaderPts = [[{ x: 150, y: 225 }]];

        const geomScale1 = calculateCalloutGeometry(boxP1, boxP2, leaderPts, 1.0);
        const geomScale2 = calculateCalloutGeometry(
          { x: boxP1.x * 2, y: boxP1.y * 2 },
          { x: boxP2.x * 2, y: boxP2.y * 2 },
          [[{ x: 150 * 2, y: 225 * 2 }]],
          2.0
        );

        const [tip1, barb1A] = geomScale1.leaders[0].arrowPoints;
        const [tip2, barb2A] = geomScale2.leaders[0].arrowPoints;

        const arrowLen1 = Math.hypot(barb1A.x - tip1.x, barb1A.y - tip1.y);
        const arrowLen2 = Math.hypot(barb2A.x - tip2.x, barb2A.y - tip2.y);

        expect(arrowLen1).toBeCloseTo(CALLOUT_ARROW_SIZE, 1);
        expect(arrowLen2).toBeCloseTo(CALLOUT_ARROW_SIZE * 2, 1);
      });

      it('calculateCalloutGeometry soporta múltiples directrices hacia la misma caja', () => {
        const boxP1 = { x: 300, y: 200 };
        const boxP2 = { x: 400, y: 250 };
        const multiLeaders = [
          [{ x: 100, y: 150 }], // hacia la izquierda
          [{ x: 500, y: 220 }], // hacia la derecha
        ];

        const geom = calculateCalloutGeometry(boxP1, boxP2, multiLeaders, 1.0);
        expect(geom.leaders.length).toBe(2);
        expect(geom.leaders[0].boxAttachment.x).toBe(300); // izquierda
        expect(geom.leaders[1].boxAttachment.x).toBe(400); // derecha
      });

      it('estimateCalloutBoxNormalizedSize calcula dimensiones normalizadas coherentes basadas en longitud del texto', () => {
        const shortText = 'Nota';
        const longText = 'Nota de ingeniería estructural con detalle ampliado para revisión de armadura principal';

        const shortSize = estimateCalloutBoxNormalizedSize(shortText);
        const longSize = estimateCalloutBoxNormalizedSize(longText);

        expect(longSize.width).toBeGreaterThan(shortSize.width);
        expect(shortSize.width).toBeGreaterThanOrEqual(CALLOUT_MIN_BOX_WIDTH / 800);
      });
    });

    describe('Sub-entregable A.4: stickyNote (Descriptor SVG y no asunción de points[1])', () => {
      it('genera descriptor SVG con un solo punto (points[0]) sin asumir points[1], midiendo 24x24 pt a escala 1', () => {
        const stickyMarkup: Markup = {
          id: 'sticky-render-test',
          type: 'stickyNote',
          pageIndex: 0,
          points: [{ x: 0.25, y: 0.3 }],
          style: {
            strokeColor: '#ca8a04',
            fillColor: '#fef08a',
            strokeWidth: 1,
            opacity: 1,
          },
          author: 'Tester',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'pending',
        };

        const transform800x600 = {
          width: 800,
          height: 600,
          scale: 1.0,
          offsetX: 0,
          offsetY: 0,
        };

        const desc = getMarkupSvgDescriptor(stickyMarkup, transform800x600);
        expect(desc.tag).toBe('g');
        expect(desc.children).toBeDefined();
        expect(desc.children!.length).toBe(4); // 1 rect de fondo + 3 líneas

        const rectDesc = desc.children![0];
        expect(rectDesc.tag).toBe('rect');
        expect(rectDesc.attrs.x).toBe(0.25 * 800); // 200
        expect(rectDesc.attrs.y).toBe(0.3 * 600); // 180
        expect(rectDesc.attrs.width).toBe(24);
        expect(rectDesc.attrs.height).toBe(24);
        expect(rectDesc.attrs.fill).toBe('#fef08a');
        expect(rectDesc.attrs.stroke).toBe('#ca8a04');

        // A escala 2.0, mide 48x48 píxeles en pantalla
        const transformScale2 = {
          width: 800,
          height: 600,
          scale: 2.0,
          offsetX: 0,
          offsetY: 0,
        };
        const descScale2 = getMarkupSvgDescriptor(stickyMarkup, transformScale2);
        const rectScale2 = descScale2.children![0];
        expect(rectScale2.attrs.width).toBe(48);
        expect(rectScale2.attrs.height).toBe(48);
      });

      it('aplica los presets de color predefinidos en fill y stroke de la nota', () => {
        const greenSticky: Markup = {
          id: 'sticky-green',
          type: 'stickyNote',
          pageIndex: 0,
          points: [{ x: 0.1, y: 0.1 }],
          style: {
            strokeColor: '#16a34a',
            fillColor: '#bbf7d0',
            strokeWidth: 1,
            opacity: 1,
          },
          author: 'Tester',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'pending',
        };

        const transform = {
          width: 800,
          height: 600,
          scale: 1.0,
          offsetX: 0,
          offsetY: 0,
        };

        const desc = getMarkupSvgDescriptor(greenSticky, transform);
        const rectDesc = desc.children![0];
        expect(rectDesc.attrs.fill).toBe('#bbf7d0');
        expect(rectDesc.attrs.stroke).toBe('#16a34a');
      });
    });

    describe('Paquete 3: Nuevas herramientas y extremos configurables', () => {
      const transform = {
        width: 800,
        height: 600,
        scale: 1.0,
        offsetX: 0,
        offsetY: 0,
      };

      it('genera descriptor de polyline para markup tipo polyLine', () => {
        const polylineMarkup: Markup = {
          id: 'poly-1',
          type: 'polyLine',
          pageIndex: 0,
          points: [
            { x: 0.1, y: 0.1 },
            { x: 0.2, y: 0.3 },
            { x: 0.4, y: 0.2 },
          ],
          style: { strokeColor: '#0284c7', strokeWidth: 3, opacity: 1 },
          author: 'Tester',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'pending',
        };

        const desc = getMarkupSvgDescriptor(polylineMarkup, transform);
        expect(desc.tag).toBe('polyline');
        expect(desc.attrs.stroke).toBe('#0284c7');
        expect(desc.attrs.fill).toBe('none');
        expect(desc.attrs.points).toBe('80.00,60.00 160.00,180.00 320.00,120.00');
      });

      it('genera descriptor para underline en base del rectángulo', () => {
        const underlineMarkup: Markup = {
          id: 'und-1',
          type: 'underline',
          pageIndex: 0,
          points: [
            { x: 0.1, y: 0.1 },
            { x: 0.3, y: 0.15 },
          ],
          style: { strokeColor: '#e02424', strokeWidth: 2, opacity: 1 },
          author: 'Tester',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'pending',
        };

        const desc = getMarkupSvgDescriptor(underlineMarkup, transform);
        expect(desc.tag).toBe('line');
        expect(desc.attrs.x1).toBe(80);
        expect(desc.attrs.y1).toBe(90); // y + height (60 + 30)
        expect(desc.attrs.x2).toBe(240);
        expect(desc.attrs.y2).toBe(90);
        expect(desc.attrs.stroke).toBe('#e02424');
      });

      it('genera descriptor para strikeOut en el centro del rectángulo', () => {
        const strikeMarkup: Markup = {
          id: 'stk-1',
          type: 'strikeOut',
          pageIndex: 0,
          points: [
            { x: 0.1, y: 0.1 },
            { x: 0.3, y: 0.15 },
          ],
          style: { strokeColor: '#e02424', strokeWidth: 2, opacity: 1 },
          author: 'Tester',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'pending',
        };

        const desc = getMarkupSvgDescriptor(strikeMarkup, transform);
        expect(desc.tag).toBe('line');
        expect(desc.attrs.x1).toBe(80);
        expect(desc.attrs.y1).toBe(75); // y + height/2 (60 + 15)
        expect(desc.attrs.x2).toBe(240);
        expect(desc.attrs.y2).toBe(75);
        expect(desc.attrs.stroke).toBe('#e02424');
      });

      it('genera grupo con extremos de línea (openArrow, closedArrow, circle, square, diamond)', () => {
        const lineWithArrows: Markup = {
          id: 'line-arrows',
          type: 'line',
          pageIndex: 0,
          points: [
            { x: 0.1, y: 0.1 },
            { x: 0.5, y: 0.1 },
          ],
          style: {
            strokeColor: '#0284c7',
            strokeWidth: 2,
            opacity: 1,
            lineEndingStart: 'circle',
            lineEndingEnd: 'openArrow',
          },
          author: 'Tester',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'pending',
        };

        const desc = getMarkupSvgDescriptor(lineWithArrows, transform);
        expect(desc.tag).toBe('g');
        expect(desc.children).toBeDefined();
        expect(desc.children!.length).toBe(3); // main line + start circle + end arrow

        // Main line
        expect(desc.children![0].tag).toBe('line');
        // Start circle
        expect(desc.children![1].tag).toBe('ellipse');
        // End arrow
        expect(desc.children![2].tag).toBe('polyline');
      });
    });
  });
});
