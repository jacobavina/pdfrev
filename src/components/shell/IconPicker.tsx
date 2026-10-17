import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { LineEndingStyle } from '../../types/markup';
import { dashArrayFor, LineStyleId, LINE_STYLE_LABELS, LINE_ENDING_LABELS } from '../../core/markup/lineStyles';
import { lineEndingShape } from '../../core/markup/lineEndings';
import { isPatternLineStyle, linePatternPrimitives } from '../../core/markup/linePatterns';
import { stampById } from '../../core/markup/stamps';
import { tok } from '../viewer/paint';
import { DEFAULT_MARKUP_COLOR } from '../../core/markup/palette';

/**
 * Selector visual (ADR-0020): el botón y cada opción muestran un dibujo del valor (tipo de línea, extremo,
 * grosor), como en Revu. El nombre queda como `title`/`aria-label` para accesibilidad y tooltips.
 * La lista se monta en <body> con posición fija: la cinta tiene overflow oculto y la recortaría.
 */
export interface IconPickerOption<T extends string | number> {
  value: T;
  label: string;
  /** Línea separadora antes de esta opción (p. ej. entre discontinuos y patrones). */
  divider?: boolean;
}

interface IconPickerProps<T extends string | number> {
  value: T | null; // null = valores mezclados (varias marcas seleccionadas)
  options: IconPickerOption<T>[];
  renderIcon: (value: T) => React.ReactNode;
  onChange: (value: T) => void;
  testId: string;
  title: string;
  /** Variante compacta para la cinta. */
  compact?: boolean;
  /** Lista con marca de selección, nombre y dibujo de cada opción, como el menú de tipos de línea de Revu. */
  withLabels?: boolean;
}

export function IconPicker<T extends string | number>({
  value,
  options,
  renderIcon,
  onChange,
  testId,
  title,
  compact,
  withLabels,
}: IconPickerProps<T>) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; minWidth: number; anchorTop: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    setPos({ left: r.left, top: r.bottom + 2, minWidth: r.width, anchorTop: r.top });
  }, [open]);
  // Siempre entera dentro de la ventana (ADR-0066): si no cabe a la derecha se desplaza a la izquierda y si no cabe
  // debajo se abre hacia arriba (el panel de Propiedades está pegado al borde derecho)
  useLayoutEffect(() => {
    if (!open || !pos || !listRef.current) return;
    const lr = listRef.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(pos.left, window.innerWidth - lr.width - 8));
    const top = pos.top + lr.height > window.innerHeight - 8 ? Math.max(8, pos.anchorTop - lr.height - 2) : pos.top;
    if (Math.abs(left - pos.left) > 0.5 || Math.abs(top - pos.top) > 0.5) setPos({ ...pos, left, top });
  }, [open, pos]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = options.find((o) => o.value === value);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-testid={testId}
        data-value={value === null ? '' : String(value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${title}: ${current?.label ?? 'mixed'}`}
        title={`${title}: ${current?.label ?? 'mixed'}`}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-0.5 rounded border border-cad-border bg-cad-panel text-gray-200 hover:border-cad-accent focus:outline-none focus:border-cad-accent ${
          compact ? 'h-[20px] px-1' : 'h-7 px-1.5 w-full justify-between'
        }`}
      >
        <span className="flex items-center">{value === null ? <span className="text-2xs text-gray-400 px-1">— mixed —</span> : renderIcon(value)}</span>
        <ChevronDown size={16} className="text-gray-500 shrink-0" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={listRef}
            role="listbox"
            aria-label={title}
            data-testid={`${testId}-list`}
            style={{ position: 'fixed', left: pos.left, top: pos.top, minWidth: pos.minWidth, zIndex: 1000 }}
            className="bg-cad-panel border border-cad-border rounded shadow-float py-1 max-h-[70vh] overflow-y-auto thin-scroll"
          >
            {options.map((o) => (
              <React.Fragment key={String(o.value)}>
              {o.divider && <div className="my-1 h-px bg-cad-border" role="separator" />}
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                aria-label={o.label}
                title={o.label}
                data-testid={`${testId}-option-${o.value}`}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center px-2 py-1 text-gray-200 hover:bg-cad-hover ${
                  withLabels ? 'gap-2' : o.value === value ? 'bg-cad-hover ring-1 ring-inset ring-cad-accent' : ''
                }`}
              >
                {withLabels ? (
                  <>
                    <span className="w-3.5 shrink-0 text-cad-accent">{o.value === value && <Check size={16} />}</span>
                    <span className="w-[112px] shrink-0 text-left text-xs whitespace-nowrap">{o.label}</span>
                    {renderIcon(o.value)}
                  </>
                ) : (
                  renderIcon(o.value)
                )}
              </button>
              </React.Fragment>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}

// ── Dibujos de los valores ──────────────────────────────────────────────────────────────────

/** Tramo de línea con el patrón real (misma geometría que la pantalla y el PDF, ADR-0041). */
export const LineStylePreview: React.FC<{ id: LineStyleId; width?: number }> = ({ id, width = 46 }) => {
  if (isPatternLineStyle(id)) {
    const y = id === 'cloud' ? 10 : 7;
    const res = linePatternPrimitives([{ x: 3, y }, { x: width - 3, y }], false, id, {
      strokeWidth: 1,
      unitsPerPt: id === 'gas' || id === 'hotWater' ? 1.2 : 1,
      cloudStep: 9,
    });
    return (
      <svg width={width} height={14} aria-hidden="true" data-pattern={id}>
        {res.strokes.map((st, i) => (
          <path key={i} d={st.d} fill="none" stroke="currentColor" strokeWidth={st.width ? Math.max(0.9, st.width) : 1.2} />
        ))}
      </svg>
    );
  }
  const dash = dashArrayFor(id, 1.5);
  return (
    <svg width={width} height={14} aria-hidden="true">
      <line
        x1={3}
        y1={7}
        x2={width - 3}
        y2={7}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeDasharray={dash && dash.length ? dash.map((d) => d * 1.2).join(' ') : undefined}
      />
    </svg>
  );
};

/** Línea con el extremo dibujado con la geometría compartida (la misma de la pantalla y del /AP). */
export const LineEndingPreview: React.FC<{ ending: LineEndingStyle; side: 'start' | 'end'; width?: number }> = ({
  ending,
  side,
  width = 46,
}) => {
  const y = 6;
  const tip = side === 'start' ? { x: 6, y } : { x: width - 6, y };
  const angle = side === 'start' ? Math.PI : 0;
  const shape = lineEndingShape(tip, angle, ending, 8);
  return (
    <svg width={width} height={12} aria-hidden="true">
      <line x1={side === 'start' ? 6 : 3} y1={y} x2={side === 'start' ? width - 3 : width - 6} y2={y} stroke="currentColor" strokeWidth={1.5} />
      {shape &&
        (shape.kind === 'circle' ? (
          <circle cx={shape.cx} cy={shape.cy} r={shape.r} fill="currentColor" stroke="currentColor" />
        ) : (
          React.createElement(shape.kind, {
            points: shape.points.map((p) => `${p.x},${p.y}`).join(' '),
            fill: shape.filled ? 'currentColor' : 'none',
            stroke: 'currentColor',
            strokeWidth: 1.5,
            strokeLinejoin: 'round',
          })
        ))}
    </svg>
  );
};

/** Grosor: tramo con el grosor relativo y su valor en pt. */
export const StrokeWidthPreview: React.FC<{ width: number }> = ({ width }) => (
  <span className="flex items-center gap-1">
    <svg width={30} height={12} aria-hidden="true">
      <line x1={2} y1={6} x2={28} y2={6} stroke="currentColor" strokeWidth={Math.max(0.6, Math.min(width, 8) * 1.1)} strokeLinecap="butt" />
    </svg>
    <span className="text-2xs ui-data text-gray-400 w-6 text-right">{width}</span>
  </span>
);

/** Tipos de línea en el orden del menú de Revu: continua, discontinuas y patrones (ADR-0041). */
export const LINE_STYLE_OPTIONS: IconPickerOption<LineStyleId>[] = (Object.keys(LINE_STYLE_LABELS) as LineStyleId[]).map(
  (id) => ({ value: id, label: LINE_STYLE_LABELS[id], ...(id === 'cloud' ? { divider: true } : {}) })
);

export const LINE_ENDING_OPTIONS: IconPickerOption<LineEndingStyle>[] = (
  ['none', 'openArrow', 'closedArrow', 'rOpenArrow', 'rClosedArrow', 'circle', 'square', 'diamond', 'butt', 'slash'] as LineEndingStyle[]
).map((id) => ({ value: id, label: LINE_ENDING_LABELS[id] }));

/** Opacidad: muestra del color sobre damero y su porcentaje. */
export const OpacityPreview: React.FC<{ opacity: number; color?: string }> = ({ opacity, color = DEFAULT_MARKUP_COLOR }) => (
  <span className="flex items-center gap-1">
    <svg width={14} height={14} aria-hidden="true">
      <rect x={0} y={0} width={7} height={7} fill={tok('ov-check-a')} />
      <rect x={7} y={7} width={7} height={7} fill={tok('ov-check-a')} />
      <rect x={0} y={7} width={7} height={7} fill={tok('ov-check-b')} />
      <rect x={7} y={0} width={7} height={7} fill={tok('ov-check-b')} />
      <rect x={0} y={0} width={14} height={14} fill={color} fillOpacity={opacity} stroke="currentColor" strokeWidth={0.8} />
    </svg>
    <span className="text-2xs ui-data text-gray-400 w-7 text-right">{Math.round(opacity * 100)}%</span>
  </span>
);

/** Sello en miniatura (doble marco del color del sello con su texto). */
export const StampPreview: React.FC<{ id: string }> = ({ id }) => {
  const def = stampById(id);
  return (
    <span
      className="inline-flex items-center justify-center px-1.5 h-[18px] rounded-sm text-2xs font-bold tracking-wide whitespace-nowrap"
      style={{ color: def.color, border: `1.5px solid ${def.color}`, borderRadius: 4, background: tok('ov-halo', 0.85) }}
    >
      {def.label}
    </span>
  );
};
