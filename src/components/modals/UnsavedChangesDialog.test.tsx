// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';
import { useUnsavedChangesStore } from '../../services/unsavedChangesService';

describe('UnsavedChangesDialog Component', () => {
  beforeEach(() => {
    useUnsavedChangesStore.setState({ pendingClose: null });
    vi.restoreAllMocks();
  });

  it('no renderiza nada cuando pendingClose es null', () => {
    const { container } = render(<UnsavedChangesDialog />);
    expect(container.firstChild).toBeNull();
  });

  it('renderiza el modal con el nombre del documento cuando hay cierre pendiente', () => {
    useUnsavedChangesStore.setState({
      pendingClose: { type: 'tab', tabId: 'tab-1', fileName: 'blueprint_elevation.pdf' },
    });

    render(<UnsavedChangesDialog />);

    expect(screen.getByTestId('unsaved-changes-dialog')).toBeInTheDocument();
    expect(screen.getByText(/blueprint_elevation\.pdf/)).toBeInTheDocument();
    expect(screen.getByTestId('unsaved-save-btn')).toBeInTheDocument();
    expect(screen.getByTestId('unsaved-discard-btn')).toBeInTheDocument();
    expect(screen.getByTestId('unsaved-cancel-btn')).toBeInTheDocument();
  });

  it('al hacer clic en Cancel invoca cancelClose y cierra el modal', () => {
    useUnsavedChangesStore.setState({
      pendingClose: { type: 'app', fileName: 'test.pdf' },
    });

    render(<UnsavedChangesDialog />);

    const cancelBtn = screen.getByTestId('unsaved-cancel-btn');
    fireEvent.click(cancelBtn);

    expect(useUnsavedChangesStore.getState().pendingClose).toBeNull();
  });

  it('al hacer clic en Don\'t Save invoca confirmDiscard', async () => {
    const discardSpy = vi.fn();
    useUnsavedChangesStore.setState({
      pendingClose: { type: 'tab', tabId: 'tab-1', fileName: 'plan.pdf' },
      confirmDiscard: discardSpy,
    });

    render(<UnsavedChangesDialog />);

    const discardBtn = screen.getByTestId('unsaved-discard-btn');
    fireEvent.click(discardBtn);

    expect(discardSpy).toHaveBeenCalledTimes(1);
  });

  it('al hacer clic en Save invoca confirmSave', async () => {
    const saveSpy = vi.fn().mockResolvedValue(true);
    useUnsavedChangesStore.setState({
      pendingClose: { type: 'tab', tabId: 'tab-1', fileName: 'plan.pdf' },
      confirmSave: saveSpy,
    });

    render(<UnsavedChangesDialog />);

    const saveBtn = screen.getByTestId('unsaved-save-btn');
    fireEvent.click(saveBtn);

    expect(saveSpy).toHaveBeenCalledTimes(1);
  });
});
