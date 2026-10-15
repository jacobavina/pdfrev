import React, { useState } from 'react';
import { isAllowedLinkUrl, normalizeLinkUrl } from '../../services/linkService';

/**
 * Diálogo de hipervínculo (ADR-0027), como el de Revu: la acción es abrir una dirección web o ir a una página
 * del documento.
 */
export const LinkDialog: React.FC<{
  numPages: number;
  initial?: { uri?: string; page?: number };
  onConfirm: (target: { uri: string } | { page: number }) => void;
  onCancel: () => void;
}> = ({ numPages, initial, onConfirm, onCancel }) => {
  const [mode, setMode] = useState<'url' | 'page'>(initial?.page ? 'page' : 'url');
  const [url, setUrl] = useState(initial?.uri ?? '');
  const [page, setPage] = useState(String(initial?.page ?? 1));
  const [error, setError] = useState<string | null>(null);

  const confirm = () => {
    if (mode === 'url') {
      const u = normalizeLinkUrl(url);
      if (!isAllowedLinkUrl(u)) {
        setError('Enter a valid web address (http, https) or e-mail.');
        return;
      }
      onConfirm({ uri: u });
    } else {
      const n = Number(page);
      if (!Number.isInteger(n) || n < 1 || n > numPages) {
        setError(`Enter a page between 1 and ${numPages}.`);
        return;
      }
      onConfirm({ page: n });
    }
  };

  const input = 'w-full rounded border border-cad-border bg-cad-dark px-2 py-1 text-gray-200 focus:outline-none focus:border-cad-accent';
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onMouseDown={onCancel}>
      <div
        role="dialog"
        aria-label="Hyperlink"
        data-testid="link-dialog"
        className="w-[380px] bg-cad-panel border border-cad-border rounded-xl shadow-[0_24px_64px_rgba(0,0,0,0.38)] text-xs text-gray-200 p-4 space-y-3"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') confirm();
          if (e.key === 'Escape') onCancel();
        }}
      >
        <div className="text-sm font-semibold text-cad-strong">Hyperlink</div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="radio" checked={mode === 'url'} onChange={() => setMode('url')} data-testid="link-mode-url" />
          Open a web address
        </label>
        <input
          data-testid="link-url"
          className={input}
          value={url}
          placeholder="https://…"
          disabled={mode !== 'url'}
          autoFocus
          onChange={(e) => setUrl(e.target.value)}
        />
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="radio" checked={mode === 'page'} onChange={() => setMode('page')} data-testid="link-mode-page" />
          Go to a page in this document
        </label>
        <input
          data-testid="link-page"
          className={`${input} w-24`}
          value={page}
          inputMode="numeric"
          disabled={mode !== 'page'}
          onChange={(e) => setPage(e.target.value)}
        />
        {error && (
          <p role="alert" className="text-rose-500">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onCancel} className="px-3 py-1 rounded hover:bg-cad-hover">
            Cancel
          </button>
          <button
            type="button"
            data-testid="link-confirm"
            onClick={confirm}
            className="px-3 py-1 rounded bg-cad-accent text-white hover:opacity-90"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};
