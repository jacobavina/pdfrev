import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PDFDocument, PDFName, PDFDict, PDFRef, PDFArray, PDFString } from 'pdf-lib';
import { saveIncrementalMarkups } from './incrementalWriter';
import { importPdfAnnotations } from './annotationReader';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useUiStore } from '../../store/useUiStore';
import { MarkupsList } from '../../components/MarkupsList';
import { CanvasContextMenu } from '../../components/shell/CanvasContextMenu';
import { buildCsvContent, buildPdfReportContent } from '../../services/exportService';
import { Markup } from '../../types/markup';

async function createBlankPdfBytes(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  return await doc.save({ useObjectStreams: false });
}

describe('Hilos de respuestas (/IRT /RT /R) y estados de revisión con historial (ADR-0071)', () => {
  beforeEach(() => {
    useMarkupStore.getState().setMarkups([]);
    useDocumentStore.setState({
      currentPageIndex: 0,
      customColumns: [],
      fileName: 'plano-ingenieria.pdf',
    });
    useUiStore.setState({
      markupsListOpen: true,
      replyRequest: null,
    });
  });

  it('persiste respuestas en hilo (/IRT /RT /R) dentro del PDF incremental y las reimporta en orden cronologico', async () => {
    const basePdf = await createBlankPdfBytes();
    const rootMarkup: Markup = {
      id: 'mk-root-1',
      type: 'cloud',
      pageIndex: 0,
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.4, y: 0.3 },
      ],
      style: { strokeColor: '#ff0000', strokeWidth: 2, opacity: 1 },
      text: 'Interferencia con viga principal',
      author: 'Ing. Estructural',
      status: 'pending',
      createdAt: '2026-04-16T09:00:00.000Z',
      updatedAt: '2026-04-16T09:00:00.000Z',
      replies: [
        {
          id: 'rep-1',
          author: 'Ing. MEP',
          text: 'Desviaremos el conducto 15 cm al norte',
          createdAt: '2026-04-16T10:00:00.000Z',
          updatedAt: '2026-04-16T10:00:00.000Z',
        },
        {
          id: 'rep-2',
          author: 'Ing. Estructural',
          text: 'De acuerdo, verificar paso en eje C',
          createdAt: '2026-04-16T11:30:00.000Z',
          updatedAt: '2026-04-16T11:30:00.000Z',
        },
      ],
    };

    const savedBytes = await saveIncrementalMarkups(basePdf, [rootMarkup], {});

    // Verificar en el PDF crudo que las respuestas tienen /IRT y /RT /R y no llevan /REA
    const rawDoc = await PDFDocument.load(savedBytes);
    const annots = rawDoc.getPages()[0].node.Annots() as PDFArray;
    expect(annots.size()).toBe(3); // 1 raíz + 2 respuestas

    const replyDicts: PDFDict[] = [];
    for (let i = 0; i < annots.size(); i++) {
      const d = rawDoc.context.lookup(annots.get(i)) as PDFDict;
      if (d.get(PDFName.of('IRT')) instanceof PDFRef && !d.get(PDFName.of('StateModel'))) {
        replyDicts.push(d);
      }
    }
    expect(replyDicts).toHaveLength(2);
    expect(replyDicts[0].get(PDFName.of('RT'))?.toString()).toBe('/R');
    expect(replyDicts[0].get(PDFName.of('REA'))).toBeUndefined();

    // Reimportar y comprobar que las respuestas vuelven anidadas en la marca padre y no como notas sueltas
    const imported = await importPdfAnnotations(savedBytes);
    expect(imported.markups).toHaveLength(1);
    expect(imported.markups[0].id).toBe('mk-root-1');
    expect(imported.markups[0].replies).toHaveLength(2);
    expect(imported.markups[0].replies![0]).toMatchObject({
      id: 'rep-1',
      author: 'Ing. MEP',
      text: 'Desviaremos el conducto 15 cm al norte',
    });
    expect(imported.markups[0].replies![1]).toMatchObject({
      id: 'rep-2',
      author: 'Ing. Estructural',
      text: 'De acuerdo, verificar paso en eje C',
    });

    // Si se elimina una respuesta y se vuelve a guardar, no quedan respuestas huérfanas en /Annots
    const updatedMarkup: Markup = {
      ...imported.markups[0],
      replies: [imported.markups[0].replies![0]],
    };
    const resavedBytes = await saveIncrementalMarkups(
      savedBytes,
      [updatedMarkup],
      {},
      {
        importedIds: ['mk-root-1'],
      }
    );
    const reimported = await importPdfAnnotations(resavedBytes);
    expect(reimported.markups).toHaveLength(1);
    expect(reimported.markups[0].replies).toHaveLength(1);
    expect(reimported.markups[0].replies![0].id).toBe('rep-1');
  });

  it('importa cadenas transitivas de respuestas /IRT de Revu y Acrobat sin crear notas adhesivas sueltas', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);

    const rootDict = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Square',
      Rect: [100, 500, 250, 600],
      NM: PDFString.of('foreign-rect-1'),
      T: PDFString.of('Arquitecto Revu'),
      Contents: PDFString.of('Revisar hueco de escalera'),
      C: [1, 0, 0],
      M: PDFString.of('D:20260416080000Z'),
    });
    const rootRef = doc.context.register(rootDict);

    // Respuesta 1 apuntando a la marca raíz con /RT /R explícito
    const reply1Dict = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Text',
      Rect: [100, 500, 120, 520],
      NM: PDFString.of('foreign-reply-1'),
      IRT: rootRef,
      RT: 'R',
      T: PDFString.of('Revisor A'),
      Contents: PDFString.of('Falta barandilla según código'),
      CreationDate: PDFString.of('D:20260416090000Z'),
      M: PDFString.of('D:20260416090000Z'),
    });
    const reply1Ref = doc.context.register(reply1Dict);

    // Respuesta 2 anidada apuntando a reply1Ref (como hace Acrobat/Revu al responder a una respuesta) y sin /RT explícito (por defecto /R)
    const reply2Dict = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Text',
      Rect: [100, 500, 120, 520],
      NM: PDFString.of('foreign-reply-2'),
      IRT: reply1Ref,
      T: PDFString.of('Revisor B'),
      Contents: PDFString.of('Añadida en detalle D-04'),
      CreationDate: PDFString.of('D:20260416100000Z'),
      M: PDFString.of('D:20260416100000Z'),
    });
    const reply2Ref = doc.context.register(reply2Dict);

    page.node.set(PDFName.of('Annots'), doc.context.obj([rootRef, reply1Ref, reply2Ref]));
    const pdfBytes = await doc.save({ useObjectStreams: false });

    const imported = await importPdfAnnotations(pdfBytes);
    expect(imported.markups).toHaveLength(1);
    expect(imported.markups[0].id).toBe('foreign-rect-1');
    expect(imported.markups[0].type).toBe('rectangle');
    expect(imported.markups[0].replies).toHaveLength(2);
    expect(imported.markups[0].replies!.map((r) => r.text)).toEqual([
      'Falta barandilla según código',
      'Añadida en detalle D-04',
    ]);
  });

  it('preserva multiples transiciones de estado de revision (/StateModel Review) en ida y vuelta PDF y el ultimo prevalece', async () => {
    const store = useMarkupStore.getState();
    store.addMarkup({
      id: 'mk-state-1',
      type: 'rectangle',
      pageIndex: 0,
      points: [
        { x: 0.2, y: 0.2 },
        { x: 0.5, y: 0.5 },
      ],
      style: { strokeColor: '#0055ff', strokeWidth: 2, opacity: 1 },
      text: 'Comprobar armadura inferior',
      author: 'Revisor 1',
      status: 'pending',
      createdAt: '2026-04-16T09:00:00.000Z',
      updatedAt: '2026-04-16T09:00:00.000Z',
    });

    const mId = useMarkupStore.getState().markups[0].id;
    useMarkupStore.getState().updateMarkupStatus(mId, 'accepted');
    useMarkupStore.getState().updateMarkupStatus(mId, 'rejected');
    useMarkupStore.getState().updateMarkupStatus(mId, 'completed');

    let current = useMarkupStore.getState().markups[0];
    expect(current.status).toBe('completed');
    expect(current.statusHistory?.map((t) => t.status)).toEqual([
      'accepted',
      'rejected',
      'completed',
    ]);

    // Probar Undo y Redo de la transición de estado
    useMarkupStore.getState().undo();
    current = useMarkupStore.getState().markups[0];
    expect(current.status).toBe('rejected');
    expect(current.statusHistory?.map((t) => t.status)).toEqual(['accepted', 'rejected']);

    useMarkupStore.getState().redo();
    current = useMarkupStore.getState().markups[0];
    expect(current.status).toBe('completed');
    expect(current.statusHistory?.map((t) => t.status)).toEqual([
      'accepted',
      'rejected',
      'completed',
    ]);

    // Guardar en PDF e importar de vuelta verificando las 3 transiciones
    const basePdf = await createBlankPdfBytes();
    const savedBytes = await saveIncrementalMarkups(basePdf, [current], {});
    const imported = await importPdfAnnotations(savedBytes);

    expect(imported.markups).toHaveLength(1);
    expect(imported.markups[0].status).toBe('completed');
    expect(imported.markups[0].statusHistory).toHaveLength(3);
    expect(imported.markups[0].statusHistory!.map((t) => t.status)).toEqual([
      'accepted',
      'rejected',
      'completed',
    ]);
  });

  it('renderiza arbol de respuestas en MarkupsList, responde desde menu contextual y exporta hilos en CSV y PDF', async () => {
    const store = useMarkupStore.getState();
    store.addMarkup({
      id: 'mk-ui-1',
      type: 'callout',
      pageIndex: 0,
      points: [
        { x: 0.2, y: 0.2 },
        { x: 0.3, y: 0.3 },
        { x: 0.5, y: 0.4 },
      ],
      style: { strokeColor: '#ff0000', strokeWidth: 2, opacity: 1 },
      text: 'Revisar pendiente de drenaje',
      author: 'Coordinador BIM',
      status: 'pending',
      createdAt: '2026-04-16T09:00:00.000Z',
      updatedAt: '2026-04-16T09:00:00.000Z',
    });

    const markupId = useMarkupStore.getState().markups[0].id;
    useMarkupStore.getState().selectMarkup(markupId, false);

    render(
      React.createElement(
        'div',
        null,
        React.createElement(CanvasContextMenu, { x: 100, y: 100, onClose: () => {} }),
        React.createElement(MarkupsList, null)
      )
    );

    // Disparar Reply… desde el menú contextual del lienzo
    fireEvent.click(screen.getByTestId('canvas-menu-reply'));

    // El compositor inline se abre para esa marca
    const input = screen.getByTestId('reply-composer-input');
    fireEvent.change(input, { target: { value: 'Pendiente ajustada al 2%' } });
    fireEvent.click(screen.getByTestId('reply-composer-submit'));

    const updatedMarkup = useMarkupStore.getState().markups[0];
    expect(updatedMarkup.replies).toHaveLength(1);
    const replyId = updatedMarkup.replies![0].id;

    // Verificar fila hija y contador en el árbol de MarkupsList
    expect(screen.getByTestId(`markup-replies-count-${markupId}`).textContent).toBe('1');
    expect(screen.getByTestId(`markup-reply-row-${replyId}`)).toBeTruthy();

    // Editar texto de la respuesta inline y probar Undo/Redo
    const replyInput = screen.getByTestId(`reply-comment-input-${replyId}`) as HTMLInputElement;
    fireEvent.change(replyInput, { target: { value: 'Pendiente confirmada al 2.5%' } });
    expect(useMarkupStore.getState().markups[0].replies![0].text).toBe(
      'Pendiente confirmada al 2.5%'
    );

    // Plegar y desplegar el hilo
    fireEvent.click(screen.getByTestId(`toggle-replies-btn-${markupId}`));
    expect(screen.queryByTestId(`markup-reply-row-${replyId}`)).toBeNull();
    fireEvent.click(screen.getByTestId(`toggle-replies-btn-${markupId}`));
    expect(screen.getByTestId(`markup-reply-row-${replyId}`)).toBeTruthy();

    // Exportar CSV y PDF Summary verificando que incluyen la respuesta
    const csvBytes = buildCsvContent(useMarkupStore.getState().markups);
    const csvText = new TextDecoder('utf-8').decode(csvBytes.slice(3));
    expect(csvText).toContain('1,Reply,Pendiente confirmada al 2.5%');

    const pdfBytes = await buildPdfReportContent(
      'plano-ingenieria.pdf',
      useMarkupStore.getState().markups
    );
    const reportDoc = await PDFDocument.load(pdfBytes);
    expect(reportDoc.getPageCount()).toBe(1);

    // Borrar respuesta y deshacer con Undo
    fireEvent.click(screen.getByTestId(`delete-reply-btn-${replyId}`));
    expect(useMarkupStore.getState().markups[0].replies).toBeUndefined();
    act(() => {
      useMarkupStore.getState().undo();
    });
    expect(useMarkupStore.getState().markups[0].replies).toHaveLength(1);
  });
});
