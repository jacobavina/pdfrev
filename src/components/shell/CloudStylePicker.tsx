import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

/**
 * Tamaño e inversión de la nube (ADR-0041), como el botón junto al tipo de línea de Revu: un festón con un
 * desplegable que tiene "Size" (paso de los lóbulos / 10) e "Invert". Solo se habilita con el tipo de línea Cloud.
 */
interface CloudStylePickerProps {
  size: number;
  invert: boolean;
  disabled?: boolean;
  onChange: (opts: { size?: number; invert?: boolean }) => void;
}

const SIZE_MIN = 0.25;
const SIZE_MAX = 10;

export const CloudStylePicker: React.FC<CloudStylePickerProps> = ({ size, invert, disabled, onChange }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [draft, setDraft] = useState(String(size));
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setDraft(size.toFixed(2)), [size]);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    setPos({ left: r.left, top: r.bottom + 2 });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t) || panelRef.current?.contains(t)) return;
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

  const commit = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) {
      setDraft(size.toFixed(2));
      return;
    }
    const clamped = Math.max(SIZE_MIN, Math.min(SIZE_MAX, Math.round(value * 100) / 100));
    setDraft(clamped.toFixed(2));
    if (clamped !== size) onChange({ size: clamped });
  };

  const stepBy = (delta: number) => commit(Math.round((size + delta) * 100) / 100);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-testid="ribbon-cloud-style"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={`Cloud: size ${size.toFixed(2)}${invert ? ', inverted' : ''}`}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-0.5 h-[20px] px-1 rounded border border-cad-border bg-cad-panel text-gray-200 hover:border-cad-accent focus:outline-none focus:border-cad-accent disabled:opacity-40 disabled:hover:border-cad-border"
      >
        <svg width={22} height={12} aria-hidden="true">
          {/* Festón: tres lóbulos con la cúspide hacia abajo, o hacia arriba si está invertida */}
          <path
            d={invert ? 'M 2 4 a 3.2 3.2 0 0 0 6 0 a 3.2 3.2 0 0 0 6 0 a 3.2 3.2 0 0 0 6 0' : 'M 2 9 a 3.2 3.2 0 0 1 6 0 a 3.2 3.2 0 0 1 6 0 a 3.2 3.2 0 0 1 6 0'}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.3}
          />
          <path d="M 2 11.5 h 18 M 2 1 h 18" stroke="currentColor" strokeWidth={0.6} opacity={0.35} />
        </svg>
        <ChevronDown size={11} className="text-gray-500 shrink-0" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Cloud style"
            data-testid="ribbon-cloud-style-panel"
            style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 1000 }}
            className="bg-cad-panel border border-cad-border rounded-md shadow-lg p-2.5 flex flex-col gap-2 text-[11.5px] text-gray-200 min-w-[150px]"
          >
            <label className="flex items-center gap-2">
              <span className="w-8 text-gray-400">Size</span>
              <span className="flex items-center rounded border border-cad-border bg-cad-field">
                <span className="flex flex-col border-r border-cad-border">
                  <button
                    type="button"
                    aria-label="Increase size"
                    data-testid="ribbon-cloud-size-up"
                    onClick={() => stepBy(0.25)}
                    className="h-[11px] px-1 text-[8px] leading-none text-gray-400 hover:text-cad-strong"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    aria-label="Decrease size"
                    data-testid="ribbon-cloud-size-down"
                    onClick={() => stepBy(-0.25)}
                    className="h-[11px] px-1 text-[8px] leading-none text-gray-400 hover:text-cad-strong"
                  >
                    ▼
                  </button>
                </span>
                <input
                  data-testid="ribbon-cloud-size"
                  type="text"
                  inputMode="decimal"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => commit(parseFloat(draft))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commit(parseFloat(draft));
                  }}
                  className="w-14 h-[22px] bg-transparent px-1.5 text-right tabular-nums outline-none"
                />
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer pl-10">
              <input
                type="checkbox"
                data-testid="ribbon-cloud-invert"
                checked={invert}
                onChange={(e) => onChange({ invert: e.target.checked })}
                className="accent-cad-accent"
              />
              Invert
            </label>
          </div>,
          document.body
        )}
    </>
  );
};
