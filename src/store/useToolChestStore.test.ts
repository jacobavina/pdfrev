import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { useToolChestStore } from './useToolChestStore';
import { useMarkupStore, markupHistory } from './useMarkupStore';
import { useToolStore } from './useToolStore';
import * as toolChestService from '../services/toolChestService';
import { Markup, MarkupStyle } from '../types/markup';

describe('useToolChestStore (Zustand Store & Modos Propiedad/Dibujo B.2 / B.3)', () => {
  let fakeFactory: IDBFactory;

  beforeEach(async () => {
    fakeFactory = new IDBFactory();
    toolChestService.setCustomIDBFactory(fakeFactory);
    await toolChestService.resetToolChestService();

    // Reset de stores de Zustand
    markupHistory.clear();
    useMarkupStore.getState().setMarkups([]);
    useToolStore.setState({
      activeTool: 'select',
      currentStyle: { strokeColor: '#000', strokeWidth: 1, opacity: 1 },
    });
    useToolChestStore.setState({
      palettes: [],
      activePaletteId: null,
      tools: [],
      activeToolId: null,
      recentTools: [],
      isLoading: false,
      isPersistent: true,
      persistenceError: null,
    });
  });

  afterEach(async () => {
    await toolChestService.resetToolChestService();
    toolChestService.setCustomIDBFactory(null);
  });

  const createMockMarkup = (id: string, style?: Partial<MarkupStyle>): Markup => ({
    id,
    type: 'rectangle',
    pageIndex: 0,
    points: [
      { x: 0.1, y: 0.1 },
      { x: 0.4, y: 0.4 },
    ],
    style: {
      strokeColor: '#3b82f6',
      fillColor: 'transparent',
      strokeWidth: 2,
      opacity: 1,
      dashArray: [4, 4],
      fontFamily: 'Helvetica',
      fontSize: 12,
      ...style,
    },
    text: 'Marca de prueba',
    author: 'Revisor Técnico',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'pending',
  });

  describe('1. Inicialización y Gestión de Paletas con Inmutabilidad Demostrada', () => {
    it('init() inicializa paleta por defecto y estado inicial', async () => {
      await useToolChestStore.getState().init();

      const state = useToolChestStore.getState();
      expect(state.palettes.length).toBeGreaterThanOrEqual(1);
      expect(state.activePaletteId).toBe(state.palettes[0].id);
      expect(state.isPersistent).toBe(true);
      expect(state.isLoading).toBe(false);
    });

    it('createPalette demuestra inmutabilidad estricta (nuevas referencias y array anterior intacto)', async () => {
      await useToolChestStore.getState().init();
      const oldPalettes = useToolChestStore.getState().palettes;
      const initialCount = oldPalettes.length;

      const created = await useToolChestStore.getState().createPalette('Estructuras Metálicas');

      const newPalettes = useToolChestStore.getState().palettes;

      // Inmutabilidad Demostrada 1: nueva referencia de array
      expect(newPalettes).not.toBe(oldPalettes);
      // Inmutabilidad Demostrada 2: el array anterior retiene su longitud y no fue mutado in-place
      expect(oldPalettes.length).toBe(initialCount);
      // Inmutabilidad Demostrada 3: el nuevo array contiene la nueva paleta
      expect(newPalettes.length).toBe(initialCount + 1);
      expect(newPalettes.some((p) => p.id === created.id && p.name === 'Estructuras Metálicas')).toBe(true);
    });

    it('updatePalette y reorderPalettes retornan nuevas referencias sin mutar estado previo', async () => {
      await useToolChestStore.getState().init();
      const pal = await useToolChestStore.getState().createPalette('Paleta Temporal');
      const palettesBefore = useToolChestStore.getState().palettes;

      await useToolChestStore.getState().updatePalette(pal.id, { name: 'Paleta Renombrada' });

      const palettesAfter = useToolChestStore.getState().palettes;
      expect(palettesAfter).not.toBe(palettesBefore);
      expect(palettesAfter.find((p) => p.id === pal.id)?.name).toBe('Paleta Renombrada');
    });

    it('deletePalette elimina en cascada herramientas asociadas', async () => {
      await useToolChestStore.getState().init();
      const pal = await useToolChestStore.getState().createPalette('Para Borrar');
      const tool = await useToolChestStore.getState().createTool({
        paletteId: pal.id,
        name: 'Herramienta en Paleta',
        type: 'cloud',
        style: { strokeColor: '#f00', strokeWidth: 2, opacity: 1 },
      });

      expect(useToolChestStore.getState().tools.some((t) => t.id === tool.id)).toBe(true);

      await useToolChestStore.getState().deletePalette(pal.id);

      const state = useToolChestStore.getState();
      expect(state.palettes.some((p) => p.id === pal.id)).toBe(false);
      expect(state.tools.some((t) => t.id === tool.id)).toBe(false);
    });
  });

  describe('2. Conversión Marca -> Herramienta y Preservación de Estilo (Condición 3)', () => {
    it('createToolFromMarkup guarda el MISMO objeto style que la marca sin omitir campos', async () => {
      await useToolChestStore.getState().init();
      const paletteId = useToolChestStore.getState().palettes[0].id;

      // Marca con estilo completo (color, fill, strokeWidth, opacity, dashArray, fontFamily, fontSize)
      const markup = createMockMarkup('m-rich', {
        strokeColor: '#059669',
        fillColor: '#d1fae5',
        strokeWidth: 4,
        opacity: 0.85,
        dashArray: [6, 2],
        fontFamily: 'Courier',
        fontSize: 16,
      });

      const tool = await useToolChestStore.getState().createToolFromMarkup(
        paletteId,
        markup,
        'Copia de Marca Verde',
        'drawing'
      );

      // Verificación de Condición 3: El objeto style es idéntico al de la marca
      expect(tool.style).toEqual(markup.style);
      expect(tool.style.strokeColor).toBe('#059669');
      expect(tool.style.fillColor).toBe('#d1fae5');
      expect(tool.style.strokeWidth).toBe(4);
      expect(tool.style.opacity).toBe(0.85);
      expect(tool.style.dashArray).toEqual([6, 2]);
      expect(tool.style.fontFamily).toBe('Courier');
      expect(tool.style.fontSize).toBe(16);
      expect(tool.type).toBe('rectangle');
      expect(tool.mode).toBe('drawing');

      // Inmutabilidad demostrada en useToolChestStore.tools
      const tools = useToolChestStore.getState().tools;
      expect(tools.some((t) => t.id === tool.id)).toBe(true);
    });

    it('createToolFromMarkup preserva subject, layer, unitPrice, customFields y measurement', async () => {
      await useToolChestStore.getState().init();
      const paletteId = useToolChestStore.getState().palettes[0].id;

      const measurementMarkup: Markup = {
        ...createMockMarkup('m-measure', { strokeColor: '#2563eb' }),
        type: 'volume',
        subject: 'Cimentaciones Hormigón',
        layer: 'Estructuras',
        unitPrice: 125.0,
        customFields: { volumeDepth: 1.2 },
        measurement: { value: 36.0, unit: 'm', formatted: '36.00 m³' },
      };

      const tool = await useToolChestStore.getState().createToolFromMarkup(
        paletteId,
        measurementMarkup
      );

      expect(tool.subject).toBe('Cimentaciones Hormigón');
      expect(tool.layer).toBe('Estructuras');
      expect(tool.unitPrice).toBe(125.0);
      expect(tool.customFields?.volumeDepth).toBe(1.2);
      expect(tool.measurement?.unit).toBe('m');
      expect(tool.measurement?.value).toBe(36.0);
    });
  });

  describe('3. Modos Propiedad y Dibujo (Condición 2)', () => {
    it('toggleToolMode conmuta entre "drawing" y "properties"', async () => {
      await useToolChestStore.getState().init();
      const palId = useToolChestStore.getState().palettes[0].id;

      const tool = await useToolChestStore.getState().createTool({
        paletteId: palId,
        name: 'Herramienta Conmutable',
        type: 'line',
        style: { strokeColor: '#000', strokeWidth: 1, opacity: 1 },
        mode: 'drawing',
      });

      expect(tool.mode).toBe('drawing');

      const mode1 = await useToolChestStore.getState().toggleToolMode(tool.id);
      expect(mode1).toBe('properties');
      expect(useToolChestStore.getState().tools.find((t) => t.id === tool.id)?.mode).toBe('properties');

      const mode2 = await useToolChestStore.getState().toggleToolMode(tool.id);
      expect(mode2).toBe('drawing');
      expect(useToolChestStore.getState().tools.find((t) => t.id === tool.id)?.mode).toBe('drawing');
    });

    it('applyTool en Modo Dibujo activa la herramienta en useToolStore', async () => {
      await useToolChestStore.getState().init();
      const palId = useToolChestStore.getState().palettes[0].id;

      const tool = await useToolChestStore.getState().createTool({
        paletteId: palId,
        name: 'Herramienta Nube',
        type: 'cloud',
        style: { strokeColor: '#ea580c', strokeWidth: 3, opacity: 0.9 },
        mode: 'drawing',
      });

      useToolChestStore.getState().applyTool(tool);

      // Verificamos que useToolStore ahora tiene activa la herramienta con su estilo
      const activeTool = useToolStore.getState().activeTool;
      const currentStyle = useToolStore.getState().currentStyle;

      expect(activeTool).toBe('cloud');
      expect(currentStyle.strokeColor).toBe('#ea580c');
      expect(currentStyle.strokeWidth).toBe(3);
      expect(currentStyle.opacity).toBe(0.9);
      expect(useToolChestStore.getState().activeToolId).toBe(tool.id);
    });

    it('applyTool en Modo Propiedad sobre K > 1 marcas seleccionadas ejecuta UN SOLO COMANDO y un solo Ctrl+Z revierte todas', async () => {
      await useToolChestStore.getState().init();
      const palId = useToolChestStore.getState().palettes[0].id;

      // Crear K = 3 marcas en el store de marcas
      const m1 = createMockMarkup('target-1', { strokeColor: '#111', strokeWidth: 1 });
      const m2 = createMockMarkup('target-2', { strokeColor: '#222', strokeWidth: 1 });
      const m3 = createMockMarkup('target-3', { strokeColor: '#333', strokeWidth: 1 });

      useMarkupStore.setState({
        markups: [m1, m2, m3],
        selectedMarkupIds: ['target-1', 'target-2', 'target-3'],
      });

      const undoCountBefore = markupHistory.getUndoCount();

      // Crear herramienta de paleta en modo Propiedad
      const propertyTool = await useToolChestStore.getState().createTool({
        paletteId: palId,
        name: 'Aplicador Púrpura',
        type: 'rectangle',
        style: {
          strokeColor: '#9333ea',
          fillColor: 'rgba(147, 51, 234, 0.2)',
          strokeWidth: 4,
          opacity: 0.8,
        },
        mode: 'properties',
      });

      // Aplicar herramienta en modo Propiedad a las 3 marcas seleccionadas
      useToolChestStore.getState().applyTool(propertyTool);

      // Verificación 1: UN SOLO COMANDO registrado en el historial
      expect(markupHistory.getUndoCount()).toBe(undoCountBefore + 1);

      // Verificación 2: Las 3 marcas tienen el nuevo estilo aplicado
      const updatedMarkups = useMarkupStore.getState().markups;
      expect(updatedMarkups[0].style.strokeColor).toBe('#9333ea');
      expect(updatedMarkups[0].style.strokeWidth).toBe(4);
      expect(updatedMarkups[1].style.strokeColor).toBe('#9333ea');
      expect(updatedMarkups[2].style.strokeColor).toBe('#9333ea');

      // Verificación 3: UN SOLO Ctrl+Z (undo) las devuelve todas a su estilo original
      useMarkupStore.getState().undo();

      const revertedMarkups = useMarkupStore.getState().markups;
      expect(markupHistory.getUndoCount()).toBe(undoCountBefore);
      expect(revertedMarkups[0].style.strokeColor).toBe('#111');
      expect(revertedMarkups[1].style.strokeColor).toBe('#222');
      expect(revertedMarkups[2].style.strokeColor).toBe('#333');
    });

    it('applyTool en modo drawing restaura volumeDepth, countSymbol, countScale y layer en useToolStore', async () => {
      await useToolChestStore.getState().init();
      const palId = useToolChestStore.getState().palettes[0].id;

      const tool = await useToolChestStore.getState().createTool({
        paletteId: palId,
        name: 'Conteo Válvulas Especiales',
        type: 'count',
        layer: 'Instalaciones',
        subject: 'Válvula Reguladora',
        unitPrice: 150.0,
        customFields: { countSymbol: 'diamond', countScale: 200 },
        style: { strokeColor: '#e11d48', strokeWidth: 2, opacity: 1 },
        mode: 'drawing',
      });

      useToolChestStore.getState().applyTool(tool);

      expect(useToolStore.getState().activeTool).toBe('count');
      expect(useToolStore.getState().countSymbol).toBe('diamond');
      expect(useToolStore.getState().countScale).toBe(200);
      expect(useToolStore.getState().activeLayer).toBe('Instalaciones');
    });

    it('applyTool en modo properties aplica subject, layer, unitPrice y customFields sobre marcas seleccionadas', async () => {
      await useToolChestStore.getState().init();
      const palId = useToolChestStore.getState().palettes[0].id;

      useMarkupStore.setState({ markups: [] });
      const m1 = {
        ...createMockMarkup('m-target-1', { strokeColor: '#000' }),
        type: 'volume' as const,
        measurement: { value: 20, unit: 'm' as const, formatted: '20 m³' },
      };
      useMarkupStore.getState().addMarkup(m1);
      useMarkupStore.getState().setSelectedMarkupIds(['m-target-1']);

      const tool = await useToolChestStore.getState().createTool({
        paletteId: palId,
        name: 'Propiedad Hormigón',
        type: 'volume',
        subject: 'Hormigón Limpieza',
        layer: 'Cimentaciones',
        unitPrice: 90.0,
        customFields: { volumeDepth: 0.15 },
        style: { strokeColor: '#059669', strokeWidth: 3, opacity: 0.8 },
        mode: 'properties',
      });

      useToolChestStore.getState().applyTool(tool);

      const target = useMarkupStore.getState().markups[0];
      expect(target.subject).toBe('Hormigón Limpieza');
      expect(target.layer).toBe('Cimentaciones');
      expect(target.unitPrice).toBe(90.0);
      expect(target.customFields?.volumeDepth).toBe(0.15);
      expect(target.cost).toBe(1800.0); // 20 m³ * 90.00 = 1800.00
      expect(target.style.strokeColor).toBe('#059669');

      // Undo restaura todo
      useMarkupStore.getState().undo();
      const reverted = useMarkupStore.getState().markups[0];
      expect(reverted.subject).toBeUndefined();
      expect(reverted.unitPrice).toBeUndefined();
      expect(reverted.style.strokeColor).toBe('#000');
    });

    it('limpia activeToolId al cambiar a una herramienta estándar desde useToolStore.setActiveTool', async () => {
      await useToolChestStore.getState().init();
      const palId = useToolChestStore.getState().palettes[0].id;

      const tool = await useToolChestStore.getState().createTool({
        paletteId: palId,
        name: 'Pavimento Cerámico',
        type: 'area',
        subject: 'Acabados Suelos',
        unitPrice: 38.5,
        style: { strokeColor: '#16a34a', strokeWidth: 1.5, opacity: 0.8 },
        mode: 'drawing',
      });

      useToolChestStore.getState().applyTool(tool);
      expect(useToolChestStore.getState().activeToolId).toBe(tool.id);

      // El usuario activa una herramienta estándar desde fuera del Tool Chest (Ribbon/MenuBar/Hotkeys)
      useToolStore.getState().setActiveTool('area');
      expect(useToolChestStore.getState().activeToolId).toBeNull();
    });
  });

  describe('4. Herramientas Recientes y Resiliencia', () => {
    it('recordRecent y clearRecent actualizan el estado con inmutabilidad demostrada', async () => {
      await useToolChestStore.getState().init();
      const markup = createMockMarkup('m-rec', { strokeColor: '#ef4444', strokeWidth: 2 });

      const oldRecent = useToolChestStore.getState().recentTools;
      await useToolChestStore.getState().recordRecent(markup);

      const newRecent = useToolChestStore.getState().recentTools;
      expect(newRecent).not.toBe(oldRecent);
      expect(newRecent.length).toBe(1);
      expect(newRecent[0].style.strokeColor).toBe('#ef4444');

      await useToolChestStore.getState().clearRecent();
      expect(useToolChestStore.getState().recentTools).toEqual([]);
    });

    it('refleja errores de persistencia de IndexedDB sin fallar en memoria', async () => {
      await useToolChestStore.getState().init();

      // Notificar un error simulado desde toolChestService
      toolChestService.notifyToolChestError(
        new Error('Fallo de cuota'),
        'quotaExceeded'
      );

      const state = useToolChestStore.getState();
      expect(state.isPersistent).toBe(false);
      expect(state.persistenceError).not.toBeNull();
      expect(state.persistenceError?.reason).toBe('quotaExceeded');

      // Operaciones en memoria siguen respondiendo
      const pal = await useToolChestStore.getState().createPalette('Paleta en Memoria');
      expect(pal.name).toBe('Paleta en Memoria');
    });
  });
});
