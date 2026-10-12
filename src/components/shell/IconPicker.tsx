import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { LineEndingStyle } from '../../types/markup';
import { dashArrayFor, LineStyleId, LINE_STYLE_LABELS, LINE_ENDING_LABELS } from '../../core/markup/lineStyles';
import { lineEndingShape } from '../../core/markup/lineEndings';

/**
 * Selector visual (ADR-0020): el botón y cada opción muestran un dibujo del valor (tipo de línea, extremo,
 * grosor), como en Revu. El nombre queda como `title`/`aria-label` para accesibilidad y tooltips.
 * La lista se monta en <body> con posición fija: la cinta tiene overflow oculto y la recortaría.
 */
export interface IconPickerOption<T extends string | number> {
  value: T;
  label: string;
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
}

export function IconPicker<T extends string | number>({
  value,
  options,
  renderIcon,
  onChange,
  testId,
  title,
  compact,
}: IconPickerProps<T>) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; minWidth: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    setPos({ left: r.left, top: r.bottom + 2, minWidth: r.width });
  }, [open]);

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
        aria-label={`${title}: ${current?.label ?? 'varios'}`}
        title={`${title}: ${current?.label ?? 'varios'}`}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-0.5 rounded border border-cad-border bg-cad-panel text-gray-200 hover:border-cad-accent focus:outline-none focus:border-cad-accent ${
          compact ? 'h-[20px] px-1' : 'h-7 px-1.5 w-full justify-between'
        }`}
      >
        <span className="flex items-center">{value === null ? <span className="text-[11px] text-gray-400 px-1">— varios —</span> : renderIcon(value)}</span>
        <ChevronDown size={11} className="text-gray-500 shrink-0" />
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
            className="bg-cad-panel border border-cad-border rounded shadow-lg py-1"
          >
            {options.map((o) => (
              <button
                key={String(o.value)}
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
                  o.value === value ? 'bg-cad-hover ring-1 ring-inset ring-cad-accent' : ''
                }`}
              >
                {renderIcon(o.value)}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}

// ── Dibujos de los valores ──────────────────────────────────────────────────────────────────

/** Tramo de línea con el patrón real (mismas proporciones que en el PDF). */
export const LineStylePreview: React.FC<{ id: LineStyleId | 'cloud'; width?: number }> = ({ id, width = 46 }) => {
  if (id === 'cloud') {
    // Festón de nube (tipo de línea "Nube", ADR-0021)
    const n = Math.max(3, Math.floor((width - 6) / 8));
    let d = `M 3 9`;
    for (let i = 0; i < n; i++) d += ` a 4 4 0 0 1 8 0`;
    return (
      <svg width={width} height={12} aria-hidden="true">
        <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} />
      </svg>
    );
  }
  const dash = dashArrayFor(id, 1.5);
  return (
    <svg width={width} height={12} aria-hidden="true">
      <line
        x1={3}
        y1={6}
        x2={width - 3}
        y2={6}
        stroke="currentColor"
        strokeWidth={1.8}
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
    <span className="text-[10px] font-mono text-gray-400 w-6 text-right">{width}</span>
  </span>
);

export const LINE_STYLE_OPTIONS: IconPickerOption<LineStyleId>[] = (Object.keys(LINE_STYLE_LABELS) as LineStyleId[]).map(
  (id) => ({ value: id, label: LINE_STYLE_LABELS[id] })
);

export const LINE_ENDING_OPTIONS: IconPickerOption<LineEndingStyle>[] = (
  ['none', 'openArrow', 'closedArrow', 'circle', 'square', 'diamond', 'butt', 'slash'] as LineEndingStyle[]
).map((id) => ({ value: id, label: LINE_ENDING_LABELS[id] }));
