import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { colorHex, WHITE } from '../../core/markup/palette';

/**
 * Color de línea o de relleno (ADR-0065): UN swatch con el color actual que abre un desplegable con la paleta, "sin
 * relleno" si procede y el selector libre. Sustituye a las filas de bolas de color de la antigua franja.
 */
export const ColorPicker: React.FC<{
  testId: string;
  title: string;
  value: string | undefined;
  options: readonly { value: string; label: string; border?: string }[];
  allowNone?: boolean;
  /** data-testid del selector libre (input type=color). */
  customTestId: string;
  onChange: (value: string) => void;
}> = ({ testId, title, value, options, allowNone, customTestId, onChange }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; anchorTop: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const none = !value || value === 'transparent' || value === 'none';

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ left: r.left, top: r.bottom + 4, anchorTop: r.top });
  }, [open]);
  // Siempre entero dentro de la ventana (ADR-0066)
  useLayoutEffect(() => {
    if (!open || !pos || !popRef.current) return;
    const pr = popRef.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(pos.left, window.innerWidth - pr.width - 8));
    const top = pos.top + pr.height > window.innerHeight - 8 ? Math.max(8, pos.anchorTop - pr.height - 4) : pos.top;
    if (Math.abs(left - pos.left) > 0.5 || Math.abs(top - pos.top) > 0.5) setPos({ ...pos, left, top });
  }, [open, pos]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
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

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        data-testid={testId}
        data-value={none ? 'none' : colorHex(value!)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={title}
        onClick={() => setOpen((o) => !o)}
        className="h-6 px-1 flex items-center gap-1 rounded border border-cad-border bg-cad-field hover:border-gray-500"
      >
        <span className={`prop-swatch ${none ? 'prop-swatch-none' : ''}`} style={none ? undefined : { backgroundColor: value }} />
        <ChevronDown size={16} className="text-gray-400" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            role="dialog"
            aria-label={title}
            data-testid={`${testId}-popover`}
            style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 1000 }}
            className="p-2 rounded-md border border-cad-border bg-cad-panel shadow-float flex flex-col gap-2"
          >
            <div className="flex items-center gap-2">
              {allowNone && (
                <button
                  type="button"
                  data-testid={`${testId}-option-none`}
                  aria-pressed={none}
                  title="None"
                  onClick={() => pick('transparent')}
                  className="prop-swatch prop-swatch-none"
                />
              )}
              {options.map((o, i) => (
                <button
                  key={o.value}
                  type="button"
                  data-testid={`${testId}-option-${i}`}
                  aria-pressed={!none && value === o.value}
                  title={o.label}
                  onClick={() => pick(o.value)}
                  className="prop-swatch"
                  style={{ backgroundColor: o.value, ...(o.border ? { borderColor: o.border } : {}) }}
                />
              ))}
            </div>
            <label className="flex items-center gap-2 text-2xs text-gray-400">
              <input
                type="color"
                data-testid={customTestId}
                value={none ? WHITE : colorHex(value!)}
                onChange={(e) => onChange(e.target.value)}
                className="ui-swatch !w-5 !h-5"
              />
              Custom color
            </label>
          </div>,
          document.body
        )}
    </>
  );
};
