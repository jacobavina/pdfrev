import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import { SignaturesPanel } from './SignaturesPanel';
import { MenuBar } from '../shell/MenuBar';
import { LeftDock } from '../shell/LeftDock';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useUiStore } from '../../store/useUiStore';
import { createSelfSignedPfx, parsePfxCertificate, signPdfWithCertificate } from '../../core/pdf/digitalSignature';
import type { Markup } from '../../types/markup';

vi.mock('../../services/toastService', () => ({ showToast: vi.fn() }));

const blueprint = new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../../../fixtures/test-blueprint.pdf')));

const field = (id: string, pageIndex: number, y: number, custom: Record<string, string | number>, extra: Partial<Markup> = {}): Markup =>
  ({ id, type: 'formField', pageIndex, points: [{ x: 0.1, y }, { x: 0.35, y: y + 0.08 }], style: { strokeColor: '#2563eb', strokeWidth: 1, opacity: 1 }, author: 'Carlos', createdAt: '', updatedAt: '', status: 'pending', customFields: custom, ...extra }) as Markup;

describe('Panel Signatures (ADR-0122)', () => {
  beforeEach(() => {
    useDocumentStore.setState({ numPages: 3, currentPageIndex: 0, pdfBytes: blueprint });
    useUiStore.setState({ leftOpen: true, leftTab: 'signatures', rightPanel: null });
    useMarkupStore.setState({
      markups: [
        field('firmada', 0, 0.5, { fieldType: 'signature', fieldName: 'Ingeniero', sigSigned: 1, sigSigner: 'Ana Pérez', sigDate: '2026-10-22T10:30:00Z', sigReason: 'Aprobado', sigLocation: 'Lima' }, { locked: true }),
        field('pendiente', 1, 0.2, { fieldType: 'signature', fieldName: 'Director' }),
        field('texto', 0, 0.1, { fieldType: 'text', fieldName: 'Nombre' }),
      ],
      selectedMarkupIds: [],
    });
  });

  it('lista los campos de firma por página con su estado, y no los demás campos', () => {
    render(<SignaturesPanel />);
    expect(screen.getByTestId('signatures-count')).toHaveTextContent('1 of 2 signed');
    expect(screen.getByTestId('signature-row-firmada')).toHaveTextContent('Signed');
    expect(screen.getByTestId('signature-row-pendiente')).toHaveTextContent('Not signed');
    expect(screen.queryByTestId('signature-row-texto')).toBeNull();
    expect(screen.getByTestId('signature-details-firmada')).toHaveTextContent('Ana Pérez · 2026-10-22 10:30 · Reason: Aprobado · Location: Lima');
  });

  it('Sign… lleva al campo, lo selecciona y abre las propiedades, donde se firma con el certificado', () => {
    render(<SignaturesPanel />);
    fireEvent.click(screen.getByTestId('signature-sign-pendiente'));
    expect(useDocumentStore.getState().currentPageIndex).toBe(1);
    expect(useMarkupStore.getState().selectedMarkupIds).toEqual(['pendiente']);
    expect(useUiStore.getState().rightPanel).toBe('properties');
    expect(screen.queryByTestId('signature-sign-firmada')).toBeNull();
  });

  it('el siguiente sin firmar va a él y con todo firmado el botón se desactiva', () => {
    render(<SignaturesPanel />);
    fireEvent.click(screen.getByTestId('signatures-next'));
    expect(useMarkupStore.getState().selectedMarkupIds).toEqual(['pendiente']);
    act(() => useMarkupStore.setState({ markups: useMarkupStore.getState().markups.map((m) => (m.id === 'pendiente' ? { ...m, customFields: { ...m.customFields, sigSigned: 1 } } : m)) }));
    expect(screen.getByTestId('signatures-next')).toBeDisabled();
  });

  it('un PDF sin firma digital lo dice al verificar', async () => {
    render(<SignaturesPanel />);
    fireEvent.click(screen.getByTestId('signatures-verify'));
    await waitFor(() => expect(screen.getByTestId('signatures-result')).toHaveAttribute('data-status', 'none'));
    expect(screen.getByTestId('signatures-result')).toHaveTextContent('has not been signed');
  });

  it('un PDF firmado de verdad se verifica como válido y muestra firmante, motivo y lugar', async () => {
    const { pfxBytes } = await createSelfSignedPfx({ commonName: 'Carlos Rivera', password: 'rea-pass' });
    const cert = await parsePfxCertificate(pfxBytes, 'rea-pass');
    const sigField = field('sig', 0, 0.5, { fieldType: 'signature', fieldName: 'Ingeniero' });
    const { signedPdfBytes } = await signPdfWithCertificate(blueprint, [sigField], 'sig', cert, { reason: 'Emitido para obra', location: 'Ciudad de México', signDateIso: '2026-10-22T10:30:00Z' });
    useDocumentStore.setState({ pdfBytes: signedPdfBytes });
    render(<SignaturesPanel />);
    fireEvent.click(screen.getByTestId('signatures-verify'));
    await waitFor(() => expect(screen.getByTestId('signatures-result')).toHaveAttribute('data-status', 'valid'), { timeout: 10000 });
    expect(screen.getByTestId('signatures-result')).toHaveTextContent('Signed by Carlos Rivera');
    expect(screen.getByTestId('signatures-result')).toHaveTextContent('Reason: Emitido para obra');
    expect(screen.getByTestId('signatures-result')).toHaveTextContent('Location: Ciudad de México');
  }, 20000);

  it('un PDF firmado y luego alterado no se da por válido', async () => {
    const { pfxBytes } = await createSelfSignedPfx({ commonName: 'Carlos Rivera', password: 'rea-pass' });
    const cert = await parsePfxCertificate(pfxBytes, 'rea-pass');
    const { signedPdfBytes } = await signPdfWithCertificate(blueprint, [field('sig', 0, 0.5, { fieldType: 'signature', fieldName: 'F' })], 'sig', cert, {});
    const tampered = new Uint8Array(signedPdfBytes);
    tampered[100] = tampered[100] ^ 0xff;
    useDocumentStore.setState({ pdfBytes: tampered });
    render(<SignaturesPanel />);
    fireEvent.click(screen.getByTestId('signatures-verify'));
    await waitFor(() => expect(screen.getByTestId('signatures-result')).toBeInTheDocument(), { timeout: 10000 });
    expect(['invalid', 'error']).toContain(screen.getByTestId('signatures-result').getAttribute('data-status'));
  }, 20000);

  it('al cambiar el documento el resultado anterior se borra', async () => {
    render(<SignaturesPanel />);
    fireEvent.click(screen.getByTestId('signatures-verify'));
    await waitFor(() => expect(screen.getByTestId('signatures-result')).toBeInTheDocument());
    useDocumentStore.setState({ pdfBytes: new Uint8Array([1, 2, 3]) });
    await waitFor(() => expect(screen.queryByTestId('signatures-result')).toBeNull());
  });

  it('sin campos de firma lo explica, y View ▸ Panels ▸ Signatures Panel y la pestaña abren el panel', () => {
    useMarkupStore.setState({ markups: [] });
    const { unmount } = render(<SignaturesPanel />);
    expect(screen.getByTestId('signatures-empty')).toHaveTextContent('no signature fields');
    unmount();
    useUiStore.setState({ leftOpen: false, leftTab: 'pages' });
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-ver'));
    fireEvent.mouseEnter(screen.getByTestId('menu-view-panels').parentElement!);
    fireEvent.click(screen.getByTestId('menu-panel-signatures'));
    expect(useUiStore.getState()).toMatchObject({ leftTab: 'signatures', leftOpen: true });
    render(<LeftDock />);
    expect(screen.getByTestId('left-tab-signatures')).toBeInTheDocument();
  });
});
