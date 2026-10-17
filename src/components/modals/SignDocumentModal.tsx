import React, { useState } from 'react';
import { Markup } from '../../types/markup';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useCalibrationStore } from '../../store/useCalibrationStore';
import { useAttachmentStore } from '../../store/useAttachmentStore';
import { useUiStore } from '../../store/useUiStore';
import { useToolStore } from '../../store/useToolStore';
import { isTauriEnvironment, saveBbxForPdf } from '../../services/bbxPersistenceService';
import { validateSavedPdf } from '../../services/pdfPersistenceService';
import { showToast } from '../../services/toastService';
import {
  createSelfSignedPfx,
  parsePfxCertificate,
  signPdfWithCertificate,
  ParsedCertificate,
} from '../../core/pdf/digitalSignature';

export interface SignDocumentModalProps {
  markup: Markup;
  onClose: () => void;
}

/**
 * Diálogo de firma digital con certificado PKCS#12 (.pfx / .p12) o creación de certificado autofirmado nuevo (ADR-0056).
 * Cargado bajo demanda desde InteractiveProperties para no aumentar el bundle inicial.
 */
export const SignDocumentModal: React.FC<SignDocumentModalProps> = ({ markup, onClose }) => {
  const defaultAuthor = useToolStore((s) => s.author) || 'Reviewer';
  const [mode, setMode] = useState<'file' | 'create'>('file');

  // Modo archivo .pfx / .p12
  const [pfxBytes, setPfxBytes] = useState<Uint8Array | null>(null);
  const [pfxFileName, setPfxFileName] = useState<string>('');
  const [filePassword, setFilePassword] = useState<string>('');

  // Modo crear certificado autofirmado nuevo
  const [commonName, setCommonName] = useState<string>(defaultAuthor);
  const [organization, setOrganization] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [createPassword, setCreatePassword] = useState<string>('');

  // Metadatos de la firma
  const [reason, setReason] = useState<string>('Approved for construction');
  const [location, setLocation] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    setPfxBytes(new Uint8Array(buf));
    setPfxFileName(file.name);
    setErrorMsg('');
  };

  const handleDownloadGeneratedPfx = async () => {
    setErrorMsg('');
    if (!commonName.trim()) {
      setErrorMsg('Please enter your name (Common Name).');
      return;
    }
    if (!createPassword) {
      setErrorMsg('Please enter a password to protect the new .pfx file.');
      return;
    }
    setBusy(true);
    try {
      const { pfxBytes: generated } = await createSelfSignedPfx({
        commonName: commonName.trim(),
        organization: organization.trim() || undefined,
        email: email.trim() || undefined,
        password: createPassword,
      });
      const safeName = commonName.trim().replace(/[^A-Za-z0-9_-]+/g, '-') || 'digital-id';
      const blob = new Blob([generated.slice().buffer as ArrayBuffer], { type: 'application/x-pkcs12' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}.pfx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setPfxBytes(generated);
      setPfxFileName(`${safeName}.pfx`);
      setFilePassword(createPassword);
      showToast(`Digital ID exported: ${safeName}.pfx`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSign = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setBusy(true);
    try {
      let cert: ParsedCertificate;
      if (mode === 'file') {
        if (!pfxBytes) {
          setErrorMsg('Select a .pfx or .p12 certificate file first.');
          setBusy(false);
          return;
        }
        if (!filePassword) {
          setErrorMsg('Enter the certificate password.');
          setBusy(false);
          return;
        }
        cert = await parsePfxCertificate(pfxBytes, filePassword);
      } else {
        if (!commonName.trim()) {
          setErrorMsg('Enter your signer name (Common Name).');
          setBusy(false);
          return;
        }
        if (!createPassword) {
          setErrorMsg('Enter a password for the Digital ID.');
          setBusy(false);
          return;
        }
        const created = await createSelfSignedPfx({
          commonName: commonName.trim(),
          organization: organization.trim() || undefined,
          email: email.trim() || undefined,
          password: createPassword,
        });
        cert = created.certificate;
      }

      const signDateIso = new Date().toISOString();
      const { applyPropertiesToMarkups, updateMarkup } = useMarkupStore.getState();

      // 1. Actualizar la marca en el modelo con un comando deshacible y bloquear el widget
      applyPropertiesToMarkups(
        [markup.id],
        {
          customFields: {
            sigSigned: 1,
            sigSigner: cert.commonName,
            sigDate: signDateIso,
            ...(reason.trim() ? { sigReason: reason.trim() } : {}),
            ...(location.trim() ? { sigLocation: location.trim() } : {}),
          },
        },
        `Sign ${String(markup.customFields?.fieldName ?? 'Signature')}`
      );
      updateMarkup(markup.id, { locked: true });

      // 2. Si el PDF está cargado en memoria, aplicar la revisión incremental con /Type /Sig y /Contents CMS
      const { pdfBytes, filePath, customColumns, setPdfBytes } = useDocumentStore.getState();
      if (pdfBytes && pdfBytes.length > 0) {
        const latestMarkups = useMarkupStore.getState().markups;
        const importedIds = useDocumentStore.getState().importedAnnotationIds ?? [];
        const calibrations = useCalibrationStore.getState().changedCalibrations();
        const attachments = useAttachmentStore.getState().files;
        const hiddenLayers = useUiStore.getState().hiddenLayers;

        const { signedPdfBytes } = await signPdfWithCertificate(
          pdfBytes,
          latestMarkups,
          markup.id,
          cert,
          { reason, location, signDateIso },
          {},
          { importedIds, calibrations, attachments, hiddenLayers }
        );

        await validateSavedPdf(pdfBytes, signedPdfBytes, latestMarkups);
        if (setPdfBytes) setPdfBytes(signedPdfBytes);

        if (isTauriEnvironment() && filePath) {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('save_pdf', {
            filePath,
            bytes: Array.from(signedPdfBytes),
          });
          await saveBbxForPdf(filePath, latestMarkups, defaultAuthor, customColumns);
          useMarkupStore.getState().markAsClean();
        }
      }

      showToast(`Signed by ${cert.commonName}`);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="sign-document-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        onSubmit={handleSign}
        className="w-[420px] rounded-lg border border-cad-border bg-cad-panel p-4 text-xs text-gray-200 shadow-float flex flex-col gap-3"
      >
        <div className="flex items-center justify-between border-b border-cad-border pb-2">
          <h3 className="text-base font-semibold text-white">
            Sign Document — {String(markup.customFields?.fieldName ?? 'Signature')}
          </h3>
          <button
            type="button"
            data-testid="sig-modal-close"
            onClick={onClose}
            className="px-1.5 py-0.5 rounded text-gray-400 hover:text-white hover:bg-cad-hover"
          >
            ✕
          </button>
        </div>

        {/* Selector de origen del certificado digital */}
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="sig-mode-file"
            onClick={() => {
              setMode('file');
              setErrorMsg('');
            }}
            className={`flex-1 py-1.5 px-2 rounded border text-center font-medium ${
              mode === 'file'
                ? 'border-cad-accent bg-cad-accent/20 text-white'
                : 'border-cad-border text-gray-400 hover:bg-cad-hover'
            }`}
          >
            Digital ID File (.pfx / .p12)
          </button>
          <button
            type="button"
            data-testid="sig-mode-create"
            onClick={() => {
              setMode('create');
              setErrorMsg('');
            }}
            className={`flex-1 py-1.5 px-2 rounded border text-center font-medium ${
              mode === 'create'
                ? 'border-cad-accent bg-cad-accent/20 text-white'
                : 'border-cad-border text-gray-400 hover:bg-cad-hover'
            }`}
          >
            Create Self-Signed ID
          </button>
        </div>

        {mode === 'file' ? (
          <div className="flex flex-col gap-2 rounded border border-cad-border p-2.5 bg-black/20">
            <label className="text-gray-400 font-medium">PKCS#12 Certificate (.pfx, .p12)</label>
            <input
              type="file"
              accept=".pfx,.p12,application/x-pkcs12"
              data-testid="sig-pfx-input"
              onChange={handleFileChange}
              className="text-xs text-gray-300 file:mr-2 file:py-1 file:px-2 file:rounded file:border file:border-cad-border file:bg-cad-panel file:text-gray-200 hover:file:bg-cad-hover"
            />
            {pfxFileName && (
              <span data-testid="sig-pfx-filename" className="text-emerald-400 truncate">
                Loaded: {pfxFileName}
              </span>
            )}
            <label className="text-gray-400 font-medium">Password</label>
            <input
              type="password"
              data-testid="sig-pfx-password"
              value={filePassword}
              onChange={(e) => setFilePassword(e.target.value)}
              placeholder="Certificate password"
              className="w-full ui-input"
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded border border-cad-border p-2.5 bg-black/20">
            <label className="text-gray-400 font-medium">Name (Common Name)</label>
            <input
              type="text"
              data-testid="sig-create-name"
              value={commonName}
              onChange={(e) => setCommonName(e.target.value)}
              placeholder="e.g. Jane Doe, PE"
              className="w-full ui-input"
            />
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-gray-400 font-medium">Organization</label>
                <input
                  type="text"
                  data-testid="sig-create-org"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  placeholder="Optional"
                  className="w-full ui-input"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-gray-400 font-medium">Email</label>
                <input
                  type="text"
                  data-testid="sig-create-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Optional"
                  className="w-full ui-input"
                />
              </div>
            </div>
            <label className="text-gray-400 font-medium">New Certificate Password</label>
            <div className="flex gap-2">
              <input
                type="password"
                data-testid="sig-create-password"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                placeholder="Password for .pfx"
                className="flex-1 ui-input"
              />
              <button
                type="button"
                data-testid="sig-export-pfx-btn"
                disabled={busy}
                onClick={handleDownloadGeneratedPfx}
                className="px-2 py-1 rounded border border-cad-border hover:bg-cad-hover text-gray-200 whitespace-nowrap"
              >
                Export .pfx
              </button>
            </div>
          </div>
        )}

        {/* Motivo y ubicación */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-gray-400 font-medium">Reason</label>
            <input
              type="text"
              data-testid="sig-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Approved for construction"
              className="w-full ui-input"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-gray-400 font-medium">Location</label>
            <input
              type="text"
              data-testid="sig-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="City / Office"
              className="w-full ui-input"
            />
          </div>
        </div>

        {errorMsg && (
          <div data-testid="sig-error-msg" className="rounded bg-red-950/60 border border-red-700/60 px-2.5 py-1.5 text-red-300">
            {errorMsg}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1 border-t border-cad-border">
          <button
            type="button"
            data-testid="sig-cancel-btn"
            onClick={onClose}
            className="px-3 py-1 rounded border border-cad-border hover:bg-cad-hover text-gray-300"
          >
            Cancel
          </button>
          <button
            type="submit"
            data-testid="sig-confirm-btn"
            disabled={busy}
            className="px-3 py-1 rounded bg-cad-strong text-cad-panel font-medium hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Signing…' : 'Sign Document'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SignDocumentModal;
