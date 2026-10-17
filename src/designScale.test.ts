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

  it('iconos en 16, 18 o 20 px y con un único trazo de 1.75 para Lucide y los propios (ADR-0065)', () => {
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
    // Ningún trazo propio más grueso o más fino dentro de los iconos
    expect(custom.match(/strokeWidth=\{[0-9.]+\}/g) ?? []).toEqual([]);
  });
});
