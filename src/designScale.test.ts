import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Guardarraíl del rediseño de legibilidad (ADR-0062): la escala tipográfica única y el contraste de los tokens se
 * comprueban en el código fuente. El waiver del detector sobre la capa de texto de PDF.js cubre toda la URL, así que
 * esta prueba es la que avisa si vuelve un texto de interfaz por debajo de 11 px o un color sin 4.5:1.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(rel);
    return /\.(tsx?|css)$/.test(e.name) && !/\.test\./.test(e.name) ? [rel] : [];
  });
}

const rgb = (s: string) => s.trim().split(/\s+/).map(Number) as [number, number, number];
const lum = ([r, g, b]: number[]) => {
  const f = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a: number[], b: number[]) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const mix = (fg: number[], bg: number[], a: number) => fg.map((c, i) => Math.round(c * a + bg[i] * (1 - a)));

function themeTokens(css: string): Record<'light' | 'dark', Record<string, number[]>> {
  const block = (sel: string) => {
    const i = css.indexOf(sel);
    const out: Record<string, number[]> = {};
    for (const m of css.slice(i, css.indexOf('}', i)).matchAll(/--([\w-]+):\s*(\d+\s+\d+\s+\d+);/g)) out[m[1]] = rgb(m[2]);
    return out;
  };
  const light = block(':root {');
  return { light, dark: { ...light, ...block("[data-theme='dark'] {") } };
}

describe('Escala tipográfica y contraste de la interfaz (ADR-0062)', () => {
  it('la interfaz usa una sola escala tipográfica de 11/12/13/14/16 px, sin tamaños sueltos ni texto bajo 11 px', () => {
    const css = read('src/index.css');
    const scale = [...css.matchAll(/--fs-[\w-]+:\s*(\d+)px;/g)].map((m) => Number(m[1]));
    expect(scale).toEqual([11, 12, 13, 14, 16]);
    // Toda declaración de tamaño en el CSS usa la escala
    expect([...css.matchAll(/font-size:\s*([^;]+);/g)].map((m) => m[1]).filter((v) => !/^var\(--fs-/.test(v))).toEqual([]);
    // Tailwind solo ofrece los cinco tamaños de la escala
    expect(read('tailwind.config.js')).toMatch(/fontSize: \{\s*'2xs': \['var\(--fs-2xs\)'/);
    const offenders: string[] = [];
    for (const f of sourceFiles('src')) {
      const src = read(f);
      for (const m of src.matchAll(/text-\[[0-9.]+px\]/g)) offenders.push(`${f}: ${m[0]}`);
      // Texto SVG de la interfaz (reglas, previsualizaciones): nunca por debajo de 11 px. El de las marcas se dibuja
      // en pt de página en src/core y no es interfaz.
      if (f.startsWith(path.join('src', 'components'))) {
        for (const m of src.matchAll(/fontSize=\{(\d+(?:\.\d+)?)\}/g)) if (Number(m[1]) < 11) offenders.push(`${f}: fontSize=${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('el texto atenuado y el acento pasan 4.5:1 sobre todos los fondos del cromo, y el blanco sobre el acento sólido', () => {
    const t = themeTokens(read('src/index.css'));
    const backgrounds = ['cad-dark', 'cad-panel', 'cad-subtle', 'cad-field', 'cad-field-hover', 'cad-hover', 'cad-status', 'cad-ribbon'];
    for (const theme of ['light', 'dark'] as const) {
      const k = t[theme];
      for (const fg of ['gray-400', 'gray-500', 'cad-accent']) {
        for (const bg of backgrounds) expect(contrast(k[fg], k[bg]), `${theme} ${fg} sobre ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
      // Acento sobre su propio fondo tenue (pastillas y herramientas activas)
      for (const a of [0.14, 0.15, 0.2]) {
        expect(contrast(k['cad-accent'], mix(k['cad-accent'], k['cad-panel'], a)), `${theme} acento sobre acento/${a}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast([255, 255, 255], k['cad-accent-fill']), `${theme} blanco sobre acento sólido`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('ningún componente lleva colores literales (hex, rgb, hsl): solo tokens de src/index.css y tailwind.config.js (ADR-0065)', () => {
    const LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(\s*\d/;
    // El detector caza lo que debe cazar y deja pasar las referencias a tokens
    expect(LITERAL.test("className=\"bg-[#0f172a]\"")).toBe(true);
    expect(LITERAL.test("stroke=\"rgb(30, 41, 59)\"")).toBe(true);
    expect(LITERAL.test("fill={tok('ov-handle')} stroke=\"rgb(var(--cad-accent) / 0.5)\"")).toBe(false);
    const offenders: string[] = [];
    for (const f of sourceFiles(path.join('src', 'components'))) {
      read(f)
        .split('\n')
        .forEach((line, i) => {
          if (LITERAL.test(line)) offenders.push(`${f}:${i + 1}: ${line.trim().slice(0, 80)}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it('cabeceras de panel, cinta, secciones de estilo y riel usan la escala de espaciado 4/8/12/16 (ADR-0065)', () => {
    const css = read('src/index.css');
    const SCALE = new Set([0, 4, 8, 12, 16]);
    const selectors = ['.panel-header', '.ribbon-group', '.ribbon-group-label', '.ribbon-tool', '.prop-section', '.style-stack .prop-section', '.rail-btn'];
    const bad: string[] = [];
    for (const sel of selectors) {
      const i = css.indexOf(`  ${sel} {`);
      expect(i, sel).toBeGreaterThan(-1);
      const block = css.slice(i, css.indexOf('}', i));
      for (const m of block.matchAll(/\b(padding|margin|gap|row-gap|column-gap)[\w-]*:\s*([^;]+);/g)) {
        for (const v of m[2].trim().split(/\s+/)) {
          const n = v === '0' ? 0 : /^(\d+)px$/.exec(v)?.[1];
          if (n === undefined || !SCALE.has(Number(n))) bad.push(`${sel} ${m[1]}: ${m[2]}`);
        }
      }
    }
    expect(bad).toEqual([]);
    // Cabecera de panel a 32 px fijos
    expect(css.slice(css.indexOf('  .panel-header {'), css.indexOf('}', css.indexOf('  .panel-header {')))).toMatch(/height: 32px;/);
  });

  it('iconos en 16, 18 o 20 px con trazo base de 1.75 para Lucide y los propios, y sus acentos de color son tokens (ADR-0065, ADR-0066)', () => {
    const sizes: string[] = [];
    for (const f of sourceFiles(path.join('src', 'components'))) {
      for (const m of read(f).matchAll(/<([A-Z]\w*)\b[^>]*?\bsize=\{(\d+)\}/gs)) {
        // Las miniaturas de herramientas son dibujos, no iconos
        if (m[1] === 'ToolVectorThumbnail') continue;
        if (![16, 18, 20].includes(Number(m[2]))) sizes.push(`${f}: <${m[1]} size={${m[2]}}>`);
      }
    }
    expect(sizes).toEqual([]);
    const css = read('src/index.css');
    expect(css).toMatch(/svg\.lucide,\s*svg\.rea-icon \{\s*stroke-width: 1\.75;/);
    const custom = read(path.join('src', 'components', 'shell', 'customIcons.tsx'));
    expect(custom).toMatch(/strokeWidth = 1\.75/);
    expect(custom).toMatch(/className="rea-icon"/);
    // Los acentos de color de los iconos (resaltado, medición, lápiz) son tokens del tema (ADR-0066)
    expect(custom).toMatch(/MEASURE_ACCENT = tok\('icon-measure'\)/);
    expect(custom).toMatch(/HIGHLIGHT_ACCENT = tok\('icon-highlight'\)/);
    expect(custom).toMatch(/PEN_ACCENT = tok\('icon-pen'\)/);
  });

  it('en tema claro el mantel es un gris neutro (diferencia máxima entre canales ≤ 10) y sigue más oscuro que los paneles (ADR-0068)', () => {
    const t = themeTokens(read('src/index.css'));
    const spread = (x: number[]) => Math.max(...x) - Math.min(...x);
    const sum = (x: number[]) => x[0] + x[1] + x[2];
    // Si alguien reintroduce el tinte azulado del mantel claro, esta prueba se pone roja
    expect(spread(t.light['cad-canvas']), 'tema claro: el mantel no puede teñirse').toBeLessThanOrEqual(10);
    // Invariante de ADR-0064: el pozo separa la hoja y el cromo en ambos temas
    expect(sum(t.light['cad-canvas'])).toBeLessThan(sum(t.light['cad-panel']));
    expect(sum(t.dark['cad-canvas'])).toBeLessThan(sum(t.dark['cad-panel']));
    // El mantel del tema oscuro no se toca en este hito
    expect(t.dark['cad-canvas']).toEqual([13, 15, 19]);
  });


  it('las utilidades shadow-* solo viven en superficies flotantes con lista blanca: menús, popovers, avisos y diálogos (ADR-0068)', () => {
    // Nivel 3 de elevación (docs/DESIGN.md §6): la sombra es exclusiva de lo que flota sobre el contenido.
    // Las miniaturas, tarjetas, filas y paneles van a nivel 1/2 (sin sombra o con borde de 1 px).
    const FLOATING: Record<string, string[]> = {
      [path.join('src', 'components', 'shell', 'MenuBar.tsx')]: ['shadow-float'],
      [path.join('src', 'components', 'shell', 'CanvasContextMenu.tsx')]: ['shadow-float'],
      [path.join('src', 'components', 'shell', 'IconPicker.tsx')]: ['shadow-float'],
      [path.join('src', 'components', 'shell', 'ColorPicker.tsx')]: ['shadow-float'],
      [path.join('src', 'components', 'shell', 'CloudStylePicker.tsx')]: ['shadow-float'],
      [path.join('src', 'components', 'shell', 'StampPicker.tsx')]: ['shadow-float'],
      [path.join('src', 'components', 'shell', 'ToastHost.tsx')]: ['shadow-float'],
      [path.join('src', 'components', 'shell', 'ShortcutsDialog.tsx')]: ['shadow-float'],
      [path.join('src', 'components', 'shell', 'FeatureGuideDialog.tsx')]: ['shadow-float'],
      [path.join('src', 'components', 'MarkupsList.tsx')]: ['shadow-float', 'shadow-[inset_0_-1px_0_rgb(var(--cad-border))]'],
      [path.join('src', 'components', 'SearchBar.tsx')]: ['shadow-float'],
      [path.join('src', 'components', 'CalibrationModal.tsx')]: ['shadow-float'],
      [path.join('src', 'components', 'modals', 'SignDocumentModal.tsx')]: ['shadow-float'],
      [path.join('src', 'components', 'markup', 'LinkDialog.tsx')]: ['shadow-float'],
      [path.join('src', 'components', 'markup', 'InlineTextEditor.tsx')]: ['shadow-float'],
      [path.join('src', 'components', 'PdfViewer.tsx')]: ['shadow-float'],
      [path.join('src', 'components', 'viewer', 'OverlayBar.tsx')]: ['shadow-float'],
      [path.join('src', 'components', 'viewer', 'CalibrateHint.tsx')]: ['shadow-float'],
    };
    const floatUtil = () => /(?<![\w-])shadow-[\w\[\]()\/.,:%\-]+/g;
    // El detector caza una sombra decorativa en una tarjeta y deja pasar la clase propia de la hoja
    expect('className="shadow-md"'.match(floatUtil())).toEqual(['shadow-md']);
    expect('sheet-shadow'.match(floatUtil())).toBeNull();
    const offenders: string[] = [];
    for (const f of sourceFiles(path.join('src', 'components'))) {
      for (const m of read(f).matchAll(floatUtil())) {
        if (!(FLOATING[f] ?? []).includes(m[0])) offenders.push(`${f}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });


  it('la marca "R REA" va sin pastilla rellena: la R en el acento y el resto en el color fuerte (ADR-0068)', () => {
    const menu = read(path.join('src', 'components', 'shell', 'MenuBar.tsx'));
    const brand = menu.slice(menu.indexOf('aria-label="REA"'), menu.indexOf('</div>', menu.indexOf('aria-label="REA"')));
    // La R es texto en el acento (marca), sin fondo sólido
    expect(brand).toMatch(/text-cad-accent font-bold/);
    expect(brand).not.toMatch(/bg-cad-accent-fill/);
    // El texto REA sigue en el color fuerte, con tracking de marca
    expect(brand).toMatch(/font-semibold text-cad-strong tracking-wide/);
  });

  it('la cinta usa una sola convención de mayúsculas: herramientas en Mayúscula Inicial y grupos en mayúsculas con tracking, en una sola línea, y una sola grafía para Cloud+ (ADR-0068)', () => {
    const defs = read(path.join('src', 'components', 'shell', 'toolDefinitions.tsx'));
    const shorts = [...defs.matchAll(/short: '([^']+)'/g)].map((m) => m[1]);
    expect(shorts.length).toBeGreaterThan(20);
    // Herramientas en Mayúscula Inicial, escritas en los datos (sin text-transform en CSS)
    for (const s of shorts) expect(s, `short ${s}`).toMatch(/^[A-Z][a-zA-Z0-9]*(\+[A-Za-z0-9]*)?$/);
    // Grafía canónica de la herramienta combinada: "Cloud+", nunca "Cloud Plus" ni "CloudPlus"
    expect(defs).toMatch(/type: 'cloudPlus', label: 'Cloud\+ \(K\)', short: 'Cloud\+'/);
    for (const l of defs.matchAll(/label: '([^']+)'/g)) expect(l[1], `label ${l[1]}`).not.toMatch(/Cloud\s?Plus/);
    const typeLabels = read(path.join('src', 'core', 'markup', 'typeLabels.ts'));
    expect(typeLabels).toMatch(/cloudPlus: 'Cloud\+'/);
    expect(typeLabels).not.toMatch(/Cloud\s?Plus/);
    // Grupos: en mayúsculas por CSS, con tracking deliberado y altura fija, sin partir en dos líneas
    const css = read('src/index.css');
    const groupLabel = css.slice(css.indexOf('  .ribbon-group-label {'), css.indexOf('}', css.indexOf('  .ribbon-group-label {')));
    expect(groupLabel).toMatch(/text-transform: uppercase;/);
    expect(groupLabel).toMatch(/letter-spacing: 0\.08em;/);
    expect(groupLabel).toMatch(/white-space: nowrap;/);
    expect(groupLabel).toMatch(/height: 12px;/);
    // Las etiquetas de herramienta no se transforman: la convención vive en los datos
    const toolLabel = css.slice(css.indexOf('  .ribbon-tool-label {'), css.indexOf('}', css.indexOf('  .ribbon-tool-label {')));
    expect(toolLabel).not.toMatch(/text-transform/);
  });

});
