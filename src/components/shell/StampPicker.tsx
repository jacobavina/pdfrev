import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { STAMPS, STAMP_GROUPS, stampById } from '../../core/markup/stamps';
import { StampThumb } from './StampThumb';

/**
 * Selector de sellos por secciones, como el menú Stamp de Foxit y la lista de Revu (ADR-0045): cada opción muestra
 * el sello tal como quedará en el plano. La lista se monta en <body>: la cinta tiene overflow oculto.
 */
export const StampPicker: React.FC<{ value: string; onChange: (id: string) => void; testId: string }> = ({
  value,
  onChange,
  testId,
}) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 660)), top: r.bottom + 4 });
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

  const current = stampById(value);
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-testid={testId}
        data-value={value}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={`Stamp: ${current.label} (${current.group})`}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 h-[30px] px-1.5 rounded-md border border-cad-border bg-cad-panel hover:border-cad-accent"
      >
        <span className="flex items-center justify-center rounded-sm bg-white px-0.5 py-px">
          <StampThumb id={value} height={20} />
        </span>
        <ChevronDown size={16} className="text-gray-500" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Stamps"
            data-testid={`${testId}-list`}
            style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 1000 }}
            className="w-[650px] max-h-[72vh] overflow-y-auto thin-scroll bg-cad-panel border border-cad-border rounded-lg shadow-float"
          >
            {STAMP_GROUPS.map((group) => (
              <section key={group} data-testid={`${testId}-group-${group.replace(/\s+/g, '-').toLowerCase()}`}>
                <h3 className="sticky top-0 z-10 px-3 py-1.5 text-2xs font-semibold uppercase tracking-[0.08em] text-gray-400 bg-cad-subtle border-b border-cad-border">
                  {group === 'Dynamic' ? 'Dynamic stamps' : group === 'Standard' ? 'Standard stamps' : group}
                </h3>
                <div className="p-2 flex flex-wrap gap-1.5">
                  {STAMPS.filter((s) => s.group === group).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      data-testid={`${testId}-option-${s.id}`}
                      aria-pressed={s.id === value}
                      title={s.label}
                      onClick={() => {
                        onChange(s.id);
                        setOpen(false);
                      }}
                      className={`h-[44px] px-2 rounded-md flex items-center justify-center bg-white transition-shadow ${
                        s.id === value ? 'ring-2 ring-cad-accent' : 'ring-1 ring-black/10 hover:ring-gray-500/60'
                      }`}
                    >
                      <StampThumb id={s.id} height={s.kind === 'seal' ? 38 : 30} />
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>,
          document.body
        )}
    </>
  );
};
