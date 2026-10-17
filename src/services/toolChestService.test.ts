import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import {
  clearRecentTools,
  createPalette,
  createTool,
  DEFAULT_PALETTE_ID,
  DEFAULT_PALETTE_NAME,
  deletePalette,
  deleteTool,
  getPalettes,
  getRecentTools,
  getTool,
  getTools,
  isToolChestPersistent,
  MAX_RECENT_TOOLS,
  moveToolToPalette,
  onToolChestError,
  recordRecentTool,
  reorderPalettes,
  reorderTools,
  resetToolChestService,
  setCustomIDBFactory,
  setTargetDbVersion,
  updatePalette,
  updateTool,
} from './toolChestService';
import { Markup } from '../types/markup';
import { ToolChestPersistenceErrorInfo } from '../types/toolChest';

describe('ToolChestService (IndexedDB & In-Memory Fallback)', () => {
  let fakeFactory: IDBFactory;

  beforeEach(async () => {
    fakeFactory = new IDBFactory();
    setCustomIDBFactory(fakeFactory);
    await resetToolChestService();
  });

  afterEach(async () => {
    await resetToolChestService();
    setCustomIDBFactory(null);
  });

  describe('1. Inicialización y Gestión de Paletas', () => {
    it('genera la paleta por defecto si la base de datos está vacía', async () => {
      const palettes = await getPalettes();
      expect(palettes.length).toBe(1);
      expect(palettes[0].id).toBe(DEFAULT_PALETTE_ID);
      expect(palettes[0].name).toBe(DEFAULT_PALETTE_NAME);
      expect(palettes[0].isDefault).toBe(true);
      expect(palettes[0].order).toBe(0);
      expect(isToolChestPersistent()).toBe(true);
    });

    it('crea, actualiza y obtiene paletas ordenadas', async () => {
      const p1 = await createPalette({ name: 'Estructural', order: 1 });
      const p2 = await createPalette({ name: 'Instalaciones', order: 0 });

      expect(p1.id).toBeDefined();
      expect(p1.name).toBe('Estructural');
      expect(p2.id).toBeDefined();
      expect(p2.name).toBe('Instalaciones');

      const updated = await updatePalette(p1.id, { name: 'Estructuras Metálicas' });
      expect(updated.name).toBe('Estructuras Metálicas');

      const all = await getPalettes();
      // Debe incluir la por defecto creada antes o las creadas aquí ordenadas por order
      expect(all.find((p) => p.id === p1.id)?.name).toBe('Estructuras Metálicas');
      expect(all.find((p) => p.id === p2.id)?.name).toBe('Instalaciones');
      expect(all[0].order).toBeLessThanOrEqual(all[1].order);
    });

    it('reordena paletas según el array de identificadores', async () => {
      const p1 = await createPalette({ name: 'Alfa' });
      const p2 = await createPalette({ name: 'Beta' });

      await reorderPalettes([p2.id, p1.id]);

      const all = await getPalettes();
      const palBeta = all.find((p) => p.id === p2.id);
      const palAlfa = all.find((p) => p.id === p1.id);

      expect(palBeta?.order).toBe(0);
      expect(palAlfa?.order).toBe(1);
    });

    it('elimina una paleta y sus herramientas asociadas en cascada', async () => {
      const pal = await createPalette({ name: 'Para Eliminar' });
      const tool = await createTool({
        paletteId: pal.id,
        name: 'Herramienta Huérfana',
        type: 'rectangle',
        style: { strokeColor: '#ff0000', strokeWidth: 2, opacity: 1 },
      });

      expect(await getTool(tool.id)).not.toBeNull();

      await deletePalette(pal.id);

      const palettes = await getPalettes();
      expect(palettes.some((p) => p.id === pal.id)).toBe(false);

      const toolsAfter = await getTools(pal.id);
      expect(toolsAfter.length).toBe(0);
    });
  });

  describe('2. Gestión de Herramientas (CRUD, Modos y Reordenación)', () => {
    it('crea herramientas con modo, texto y estilo completo', async () => {
      const pal = await createPalette({ name: 'Paleta A' });
      const tool = await createTool({
        paletteId: pal.id,
        name: 'Nube Roja',
        type: 'cloud',
        style: { strokeColor: '#dc2626', strokeWidth: 3, opacity: 0.8 },
        text: 'Revisión Estructural',
        mode: 'drawing',
      });

      expect(tool.id).toBeDefined();
      expect(tool.name).toBe('Nube Roja');
      expect(tool.mode).toBe('drawing');
      expect(tool.order).toBe(0);

      const retrieved = await getTool(tool.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.text).toBe('Revisión Estructural');
    });

    it('actualiza y reordena herramientas dentro de una paleta', async () => {
      const pal = await createPalette({ name: 'Paleta B' });
      const t1 = await createTool({
        paletteId: pal.id,
        name: 'T1',
        type: 'line',
        style: { strokeColor: '#000', strokeWidth: 1, opacity: 1 },
      });
      const t2 = await createTool({
        paletteId: pal.id,
        name: 'T2',
        type: 'circle',
        style: { strokeColor: '#00f', strokeWidth: 2, opacity: 1 },
      });

      await updateTool(t1.id, { name: 'T1 Renombrada', mode: 'properties' });
      expect((await getTool(t1.id))?.mode).toBe('properties');

      await reorderTools(pal.id, [t2.id, t1.id]);

      const tools = await getTools(pal.id);
      expect(tools[0].id).toBe(t2.id);
      expect(tools[0].order).toBe(0);
      expect(tools[1].id).toBe(t1.id);
      expect(tools[1].order).toBe(1);
    });

    it('mueve una herramienta a otra paleta', async () => {
      const pal1 = await createPalette({ name: 'Origen' });
      const pal2 = await createPalette({ name: 'Destino' });

      const tool = await createTool({
        paletteId: pal1.id,
        name: 'Movible',
        type: 'polygon',
        style: { strokeColor: '#10b981', strokeWidth: 2, opacity: 1 },
      });

      await moveToolToPalette(tool.id, pal2.id);

      const toolsPal1 = await getTools(pal1.id);
      const toolsPal2 = await getTools(pal2.id);

      expect(toolsPal1.some((t) => t.id === tool.id)).toBe(false);
      expect(toolsPal2.some((t) => t.id === tool.id)).toBe(true);
    });

    it('elimina una herramienta individual', async () => {
      const pal = await createPalette({ name: 'Paleta C' });
      const tool = await createTool({
        paletteId: pal.id,
        name: 'Descartable',
        type: 'stickyNote',
        style: { strokeColor: '#ca8a04', strokeWidth: 1, opacity: 1 },
      });

      await deleteTool(tool.id);
      expect(await getTool(tool.id)).toBeNull();
    });
  });

  describe('3. Herramientas Recientes (Desacopladas y FIFO)', () => {
    it('registra una herramienta reciente a partir de una marca con modo y estilo', async () => {
      const markup: Markup = {
        id: 'markup-123',
        type: 'callout',
        pageIndex: 0,
        points: [{ x: 0.2, y: 0.3 }, { x: 0.5, y: 0.6 }],
        style: { strokeColor: '#e11d48', strokeWidth: 2, opacity: 1 },
        text: 'Nota de plano',
        author: 'Arquitecto',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'pending',
      };

      await recordRecentTool(markup);

      const recent = await getRecentTools();
      expect(recent.length).toBe(1);
      expect(recent[0].type).toBe('callout');
      expect(recent[0].style.strokeColor).toBe('#e11d48');
      expect(recent[0].text).toBe('Nota de plano');
      expect(recent[0].mode).toBe('drawing');
    });

    it('deduplica herramientas recientes idénticas actualizando el timestamp', async () => {
      const toolInput = {
        type: 'highlightVector' as const,
        style: { strokeColor: '#ffff00', strokeWidth: 10, opacity: 0.5 },
      };

      await recordRecentTool(toolInput);
      const firstTime = (await getRecentTools())[0].timestamp;

      // Esperar brevemente o forzar diferencia
      await new Promise((r) => setTimeout(r, 10));

      await recordRecentTool(toolInput);
      const recent = await getRecentTools();

      expect(recent.length).toBe(1);
      expect(recent[0].timestamp).toBeGreaterThanOrEqual(firstTime);
    });

    it('aplica tope estricto FIFO de MAX_RECENT_TOOLS (10 elementos)', async () => {
      for (let i = 0; i < 15; i++) {
        await recordRecentTool({
          type: 'line',
          style: { strokeColor: `#00000${i}`, strokeWidth: i + 1, opacity: 1 },
          text: `Herramienta ${i}`,
        });
      }

      const recent = await getRecentTools();
      expect(recent.length).toBe(MAX_RECENT_TOOLS);
      // El primer elemento debe ser el último añadido
      expect(recent[0].text).toBe('Herramienta 14');
    });

    it('limpia las herramientas recientes', async () => {
      await recordRecentTool({
        type: 'rectangle',
        style: { strokeColor: '#000', strokeWidth: 1, opacity: 1 },
      });
      expect((await getRecentTools()).length).toBe(1);

      await clearRecentTools();
      expect((await getRecentTools()).length).toBe(0);
    });
  });

  describe('4. Resiliencia, Fallback a Memoria Ruidoso y Oyente de Error (Condición 1)', () => {
    it('notifica a la UI y conmuta a memoria si IndexedDB no está disponible', async () => {
      const errorEvents: ToolChestPersistenceErrorInfo[] = [];
      const unsubscribe = onToolChestError((info) => {
        errorEvents.push(info);
      });

      // Factoría rota que simula rechazo en open()
      const brokenFactory = {
        open: () => {
          const req: any = {};
          setTimeout(() => {
            req.error = new DOMException('SecurityError: Access Denied', 'SecurityError');
            if (req.onerror) req.onerror();
          }, 0);
          return req;
        },
      } as unknown as IDBFactory;

      setCustomIDBFactory(brokenFactory);
      await resetToolChestService();

      // Al llamar a getPalettes, debe fallar la apertura pero responder en memoria
      const palettes = await getPalettes();

      expect(palettes.length).toBe(1);
      expect(palettes[0].id).toBe(DEFAULT_PALETTE_ID);
      expect(isToolChestPersistent()).toBe(false);

      expect(errorEvents.length).toBeGreaterThan(0);
      expect(errorEvents[0].isPersistent).toBe(false);
      expect(errorEvents[0].reason).toBe('openError');

      // Las operaciones siguen funcionando en memoria
      const p = await createPalette({ name: 'Paleta Volátil' });
      expect(p.name).toBe('Paleta Volátil');

      const all = await getPalettes();
      expect(all.some((item) => item.name === 'Paleta Volátil')).toBe(true);

      unsubscribe();
    });

    it('notifica cuota excedida (quotaExceeded) y no crashea la aplicación', async () => {
      const errorEvents: ToolChestPersistenceErrorInfo[] = [];
      const unsubscribe = onToolChestError((info) => {
        errorEvents.push(info);
      });

      // Inicializar con fake-indexeddb
      await getPalettes();

      // Simular fallo de cuota en el almacén de IDB mediante un proxy / mock en la conexión activa
      const quotaErr = new DOMException('The quota has been exceeded', 'QuotaExceededError');
      const originalOpen = fakeFactory.open.bind(fakeFactory);

      // Creamos una factoría que simula QuotaExceededError en put
      const quotaFactory = {
        open: (...args: any[]) => {
          const req = originalOpen(...(args as [any, any]));
          req.addEventListener('success', () => {
            const db = req.result;
            const origTx = db.transaction.bind(db);
            db.transaction = (...txArgs: any[]) => {
              const tx = origTx(...(txArgs as [any, any]));
              const origStore = tx.objectStore.bind(tx);
              tx.objectStore = (name: string) => {
                const store = origStore(name);
                store.put = () => {
                  throw quotaErr;
                };
                return store;
              };
              return tx;
            };
          });
          return req;
        },
      } as unknown as IDBFactory;

      setCustomIDBFactory(quotaFactory);
      await resetToolChestService();

      // Intentar crear una paleta bajo cuota excedida
      const pal = await createPalette({ name: 'Paleta Bajo Cuota' });

      // Verificaciones:
      // 1. La aplicación no crashea y devuelve la paleta creada en memoria
      expect(pal.name).toBe('Paleta Bajo Cuota');
      // 2. Se dispara el evento de error de cuota hacia la UI
      expect(errorEvents.length).toBeGreaterThan(0);
      expect(errorEvents[0].reason).toBe('quotaExceeded');
      expect(errorEvents[0].isPersistent).toBe(false);
      expect(isToolChestPersistent()).toBe(false);

      unsubscribe();
    });

    it('notifica transacción abortada (transactionError) y sigue respondiendo en memoria', async () => {
      const errorEvents: ToolChestPersistenceErrorInfo[] = [];
      const unsubscribe = onToolChestError((info) => {
        errorEvents.push(info);
      });

      const abortErr = new DOMException('Transaction aborted', 'AbortError');
      const originalOpen = fakeFactory.open.bind(fakeFactory);

      const abortFactory = {
        open: (...args: any[]) => {
          const req = originalOpen(...(args as [any, any]));
          req.addEventListener('success', () => {
            const db = req.result;
            const origTx = db.transaction.bind(db);
            db.transaction = (...txArgs: any[]) => {
              const tx = origTx(...(txArgs as [any, any]));
              const origStore = tx.objectStore.bind(tx);
              tx.objectStore = (name: string) => {
                const store = origStore(name);
                store.put = () => {
                  throw abortErr;
                };
                return store;
              };
              return tx;
            };
          });
          return req;
        },
      } as unknown as IDBFactory;

      setCustomIDBFactory(abortFactory);
      await resetToolChestService();

      const tool = await createTool({
        paletteId: 'p-1',
        name: 'Herramienta Bajo Abort',
        type: 'line',
        style: { strokeColor: '#000', strokeWidth: 1, opacity: 1 },
      });

      expect(tool.name).toBe('Herramienta Bajo Abort');
      expect(errorEvents.length).toBeGreaterThan(0);
      expect(errorEvents[0].reason).toBe('transactionError');
      expect(errorEvents[0].isPersistent).toBe(false);
      expect(isToolChestPersistent()).toBe(false);

      unsubscribe();
    });

    it('recordRecentTool nunca lanza excepciones al llamador incluso si la base de datos lanza error', async () => {
      // Simular fallo catastrófico en IDB
      const explodingFactory = {
        open: () => {
          throw new Error('Explosión catastrófica en IndexedDB');
        },
      } as unknown as IDBFactory;

      setCustomIDBFactory(explodingFactory);
      await resetToolChestService();

      // Llamar a recordRecentTool no debe lanzar
      await expect(
        recordRecentTool({
          type: 'cloud',
          style: { strokeColor: '#f00', strokeWidth: 1, opacity: 1 },
        })
      ).resolves.not.toThrow();

      // Y la herramienta se conservó en memoria
      const recent = await getRecentTools();
      expect(recent.length).toBe(1);
      expect(recent[0].type).toBe('cloud');
    });
  });

  describe('5. Migración de Esquema (Condición 6)', () => {
    it('migra de versión 1 a versión 2 preservando todas las paletas y herramientas previas', async () => {
      // Paso 1: Abrir en versión 1 y crear datos
      setTargetDbVersion(1);
      const pal = await createPalette({ name: 'Paleta Histórica v1' });
      const tool = await createTool({
        paletteId: pal.id,
        name: 'Herramienta v1',
        type: 'rectangle',
        style: { strokeColor: '#3b82f6', strokeWidth: 2, opacity: 1 },
      });

      expect(pal.name).toBe('Paleta Histórica v1');
      expect(tool.name).toBe('Herramienta v1');

      // Paso 2: Cerrar la base de datos
      await resetToolChestService();
      // Restauramos la misma factoría para que la base de datos persista en ella
      setCustomIDBFactory(fakeFactory);

      // Paso 3: Configurar objetivo versión 2 y abrir
      setTargetDbVersion(2);

      // Obtener paletas tras migración
      const palettesV2 = await getPalettes();
      const toolsV2 = await getTools(pal.id);

      // Verificación de integridad de datos preservados
      expect(palettesV2.some((p) => p.id === pal.id && p.name === 'Paleta Histórica v1')).toBe(true);
      expect(toolsV2.some((t) => t.id === tool.id && t.name === 'Herramienta v1')).toBe(true);

      // Verificar que los nuevos componentes del esquema v2 existen en la base de datos
      const req = fakeFactory.open('rea_tool_chest', 2);
      await new Promise((resolve) => {
        req.onsuccess = () => {
          const db = req.result;
          expect(db.objectStoreNames.contains('tags')).toBe(true);
          const tx = db.transaction('tools', 'readonly');
          const store = tx.objectStore('tools');
          expect(store.indexNames.contains('type')).toBe(true);
          db.close();
          resolve(true);
        };
      });
    });
  });

  describe('6. Inmutabilidad (Core Principles)', () => {
    it('retorna nuevas instancias en getPalettes y getTools sin permitir mutación de estado interno', async () => {
      const pal = await createPalette({ name: 'Inmutable' });
      const list1 = await getPalettes();
      const pFound = list1.find((p) => p.id === pal.id);
      expect(pFound).toBeDefined();

      // Mutación externa del objeto devuelto
      (pFound as any).name = 'MUTADO_EXTERNAMENTE';

      // Segunda llamada
      const list2 = await getPalettes();
      const pFound2 = list2.find((p) => p.id === pal.id);
      expect(pFound2?.name).toBe('Inmutable');
    });
  });

  describe('7. Herramientas de Medición para Takeoff (ADR-0078)', () => {
    it('guarda y reutiliza herramientas de medición en el Tool Chest conservando su Subject, escala de símbolo y profundidad', async () => {
      const pal = await createPalette({ name: 'Takeoff MEP y Estructuras' });

      // 1. Herramienta de Volumen con profundidad y precio unitario
      const volTool = await createTool({
        paletteId: pal.id,
        name: 'Hormigón Zapatas',
        type: 'volume',
        subject: 'Hormigón HA-30',
        layer: 'Cimentación',
        unitPrice: 125.5,
        customFields: { volumeDepth: 0.8 },
        measurement: { value: 24.5, unit: 'm', formatted: '24.50 m³' },
        style: { strokeColor: '#2563eb', fillColor: 'rgba(37,99,235,0.2)', strokeWidth: 2, opacity: 0.9 },
      });

      // 2. Herramienta de Conteo con símbolo y escala
      const countTool = await createTool({
        paletteId: pal.id,
        name: 'Válvula de Mariposa DN100',
        type: 'count',
        subject: 'Fontanería - Válvulas',
        layer: 'Fontanería',
        unitPrice: 85.0,
        customFields: { countSymbol: 'diamond', countScale: 150 },
        measurement: { value: 1, unit: 'm', formatted: 'Count = 1' },
        style: { strokeColor: '#dc2626', strokeWidth: 2, opacity: 1 },
      });

      // 3. Herramienta de Área con precio unitario y unidad m
      const areaTool = await createTool({
        paletteId: pal.id,
        name: 'Pavimento Cerámico',
        type: 'area',
        subject: 'Acabados Suelos',
        layer: 'Acabados',
        unitPrice: 38.5,
        measurement: { value: 80.0, unit: 'm', formatted: '80.00 m²', perimeter: 36.0 },
        style: { strokeColor: '#16a34a', fillColor: 'rgba(22,163,74,0.2)', strokeWidth: 1.5, opacity: 0.8 },
      });

      // Verificación directa en memoria/servicio
      const savedVol = await getTool(volTool.id);
      expect(savedVol).not.toBeNull();
      expect(savedVol?.subject).toBe('Hormigón HA-30');
      expect(savedVol?.layer).toBe('Cimentación');
      expect(savedVol?.unitPrice).toBe(125.5);
      expect(savedVol?.customFields?.volumeDepth).toBe(0.8);
      expect(savedVol?.measurement?.unit).toBe('m');

      const savedCount = await getTool(countTool.id);
      expect(savedCount).not.toBeNull();
      expect(savedCount?.subject).toBe('Fontanería - Válvulas');
      expect(savedCount?.layer).toBe('Fontanería');
      expect(savedCount?.unitPrice).toBe(85.0);
      expect(savedCount?.customFields?.countSymbol).toBe('diamond');
      expect(savedCount?.customFields?.countScale).toBe(150);

      const savedArea = await getTool(areaTool.id);
      expect(savedArea).not.toBeNull();
      expect(savedArea?.subject).toBe('Acabados Suelos');
      expect(savedArea?.unitPrice).toBe(38.5);
      expect(savedArea?.measurement?.unit).toBe('m');

      // 4. Persistencia en base de datos real simulada: resetear memoria y reabrir desde IndexedDB
      await resetToolChestService();
      setCustomIDBFactory(fakeFactory);

      const restoredPalettes = await getPalettes();
      const restoredPal = restoredPalettes.find((p) => p.name === 'Takeoff MEP y Estructuras');
      expect(restoredPal).toBeDefined();

      const restoredTools = await getTools(restoredPal!.id);
      expect(restoredTools.length).toBe(3);

      const rVol = restoredTools.find((t) => t.id === volTool.id);
      expect(rVol?.subject).toBe('Hormigón HA-30');
      expect(rVol?.unitPrice).toBe(125.5);
      expect(rVol?.customFields?.volumeDepth).toBe(0.8);

      const rCount = restoredTools.find((t) => t.id === countTool.id);
      expect(rCount?.subject).toBe('Fontanería - Válvulas');
      expect(rCount?.customFields?.countSymbol).toBe('diamond');
      expect(rCount?.customFields?.countScale).toBe(150);

      // 5. Herramientas Recientes preservan campos de medición
      const mockMarkup: Markup = {
        id: 'markup-vol-1',
        type: 'volume',
        pageIndex: 0,
        points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 }, { x: 0.3, y: 0.3 }, { x: 0.1, y: 0.3 }],
        style: { strokeColor: '#2563eb', strokeWidth: 2, opacity: 1 },
        author: 'Takeoff Eng',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'pending',
        subject: 'Cubicación Muros',
        layer: 'Estructuras',
        unitPrice: 110.0,
        customFields: { volumeDepth: 2.5 },
        measurement: { value: 50.0, unit: 'm', formatted: '50.00 m³' },
      };

      await recordRecentTool(mockMarkup);
      const recent = await getRecentTools();
      const recentVol = recent.find((r) => r.subject === 'Cubicación Muros');
      expect(recentVol).toBeDefined();
      expect(recentVol?.customFields?.volumeDepth).toBe(2.5);
      expect(recentVol?.unitPrice).toBe(110.0);
      expect(recentVol?.measurement?.unit).toBe('m');
    });
  });
});
