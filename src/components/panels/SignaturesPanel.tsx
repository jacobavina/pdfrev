import React, { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, PenLine, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useUiStore } from '../../store/useUiStore';
import { PanelShell } from '../shell/PanelShell';
import { describeVerification, formatSignatureDate, nextUnsigned, signatureCounts, signatureRows, type SignatureRow, type VerificationView } from '../../core/markup/signatureList';

const STATUS_STYLE: Record<VerificationView['status'], { icon: React.ReactNode; tone: string }> = {
  valid: { icon: <ShieldCheck size={16} />, tone: 'text-emerald-400' },
  'valid-edited': { icon: <ShieldAlert size={16} />, tone: 'text-amber-400' },
  invalid: { icon: <ShieldAlert size={16} />, tone: 'text-red-400' },
  none: { icon: <ShieldQuestion size={16} />, tone: 'text-gray-400' },
  error: { icon: <ShieldAlert size={16} />, tone: 'text-amber-400' },
};

/**
 * Panel Signatures (ADR-0122): los campos de firma del documento por página, firmados o pendientes, y la verificación de la
 * firma digital del documento. Firmar se hace en las propiedades del campo (certificado .pfx), que el panel abre.
 */
export const SignaturesPanel: React.FC = () => {
  const markups = useMarkupStore((s) => s.markups);
  const selected = useMarkupStore((s) => s.selectedMarkupIds);
  const pdfBytes = useDocumentStore((s) => s.pdfBytes);
  const currentPage = useDocumentStore((s) => s.currentPageIndex);
  const [result, setResult] = useState<VerificationView | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => signatureRows(markups), [markups]);
  const counts = useMemo(() => signatureCounts(rows), [rows]);
  const groups = useMemo(() => {
    const out: { pageIndex: number; rows: SignatureRow[] }[] = [];
    for (const r of rows) {
      const last = out[out.length - 1];
      if (last && last.pageIndex === r.pageIndex) last.rows.push(r);
      else out.push({ pageIndex: r.pageIndex, rows: [r] });
    }
    return out;
  }, [rows]);

  // Otro documento u otros bytes (se firmó o se cambió): el resultado anterior ya no vale
  useEffect(() => setResult(null), [pdfBytes]);

  const go = (r: SignatureRow, openProperties: boolean) => {
    useDocumentStore.getState().setCurrentPage(r.pageIndex);
    useMarkupStore.getState().setSelectedMarkupIds([r.id]);
    if (openProperties) useUiStore.getState().requestPropertiesPanel();
  };

  const verify = async () => {
    if (!pdfBytes) return;
    setBusy(true);
    try {
      const { verifyPdfSignature } = await import('../../core/pdf/digitalSignature');
      setResult(describeVerification(await verifyPdfSignature(pdfBytes)));
    } catch (err) {
      setResult(describeVerification(null, err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    const r = nextUnsigned(rows, selected[0]);
    if (r) go(r, false);
  };

  return (
    <PanelShell title="Signatures" testId="signatures-panel">
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-cad-border">
        <span className="text-gray-300 shrink-0" data-testid="signatures-count">
          {counts.signed} of {counts.total} signed
        </span>
        <span className="flex-1" />
        <button type="button" data-testid="signatures-next" disabled={counts.signed === counts.total} onClick={next} title="Go to the next unsigned field" className="ui-btn !h-6 !px-1.5 !text-2xs disabled:opacity-40">
          Next unsigned
        </button>
        <button type="button" data-testid="signatures-verify" disabled={!pdfBytes || busy} onClick={() => void verify()} title="Check the digital signature of the document" className="ui-btn !h-6 !px-1.5 !text-2xs disabled:opacity-40">
          {busy ? 'Checking…' : 'Verify'}
        </button>
      </div>
      {result && (
        <div className={`px-2 py-2 border-b border-cad-border ${STATUS_STYLE[result.status].tone}`} data-testid="signatures-result" data-status={result.status}>
          <div className="flex items-center gap-1.5 font-medium">
            {STATUS_STYLE[result.status].icon}
            {result.headline}
          </div>
          <p className="mt-0.5 text-gray-300">{result.detail}</p>
        </div>
      )}
      {rows.length === 0 && (
        <div className="p-3 text-gray-500" data-testid="signatures-empty">
          This document has no signature fields. Add one with Tools ▸ Signature ▸ Digital Signature, or press Verify to check a signed PDF.
        </div>
      )}
      {groups.map((g) => (
        <section key={g.pageIndex} data-testid={`signatures-page-${g.pageIndex}`}>
          <h3 className={`px-2 py-1 text-2xs font-medium border-b border-cad-border ${g.pageIndex === currentPage ? 'text-cad-accent' : 'text-gray-500'}`}>Page {g.pageIndex + 1}</h3>
          <ul>
            {g.rows.map((r) => (
              <li key={r.id} data-testid={`signature-row-${r.id}`} className={`px-2 py-1.5 border-b border-cad-border/50 hover:bg-cad-hover ${selected.includes(r.id) ? 'bg-cad-hover' : ''}`}>
                <button type="button" onClick={() => go(r, false)} className="flex items-center gap-1.5 w-full text-left" title="Go to this field">
                  {r.signed ? <BadgeCheck size={16} className="shrink-0 text-emerald-400" /> : <PenLine size={16} className="shrink-0 text-gray-400" />}
                  <span className="flex-1 min-w-0 truncate">{r.name}</span>
                  <span className={`shrink-0 text-2xs ${r.signed ? 'text-emerald-400' : 'text-gray-500'}`}>{r.signed ? 'Signed' : 'Not signed'}</span>
                </button>
                {r.signed ? (
                  <div className="pl-6 pt-0.5 text-2xs text-gray-400" data-testid={`signature-details-${r.id}`}>
                    {[r.signer, formatSignatureDate(r.date), r.reason && `Reason: ${r.reason}`, r.location && `Location: ${r.location}`].filter(Boolean).join(' · ')}
                  </div>
                ) : (
                  <div className="pl-6 pt-1">
                    <button type="button" data-testid={`signature-sign-${r.id}`} onClick={() => go(r, true)} className="ui-btn !h-6 !px-1.5 !text-2xs">
                      Sign…
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </PanelShell>
  );
};
