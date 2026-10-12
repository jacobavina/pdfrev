import { v4 as uuidv4 } from 'uuid';
import { Markup } from '../types/markup';
import {
  CreatePaletteInput,
  CreateToolInput,
  RecentTool,
  ToolChestErrorHandler,
  ToolChestMode,
  ToolChestPalette,
  ToolChestPersistenceErrorInfo,
  ToolChestPersistenceErrorReason,
  ToolChestTool,
} from '../types/toolChest';

export const TOOL_CHEST_DB_NAME = 'rea_tool_chest';
export const CURRENT_TOOL_CHEST_DB_VERSION = 1;
export const MAX_RECENT_TOOLS = 10;

export const PALETTES_STORE = 'palettes';
export const TOOLS_STORE = 'tools';
export const RECENT_TOOLS_STORE = 'recentTools';

export const DEFAULT_PALETTE_ID = 'default-palette';
export const DEFAULT_PALETTE_NAME = 'My Tools';

// In-memory fallback state
let isPersistent = true;
let customFactory: IDBFactory | null = null;
let targetVersion = CURRENT_TOOL_CHEST_DB_VERSION;
let activeDb: IDBDatabase | null = null;

const inMemoryPalettes = new Map<string, ToolChestPalette>();
const inMemoryTools = new Map<string, ToolChestTool>();
let inMemoryRecentTools: RecentTool[] = [];

const errorListeners = new Set<ToolChestErrorHandler>();

/**
 * Registra un oyente para notificar a la UI (toast, banner) si la persistencia falla.
 */
export function onToolChestError(handler: ToolChestErrorHandler): () => void {
  errorListeners.add(handler);
  return () => {
    errorListeners.delete(handler);
  };
}

/**
 * Consulta si el almacenamiento persistente en IndexedDB está activo.
 */
export function isToolChestPersistent(): boolean {
  return isPersistent;
}

/**
 * Notifica a los oyentes de error y conmuta el estado de persistencia a falso.
 */
export function notifyToolChestError(
  error: Error,
  reason: ToolChestPersistenceErrorReason
): void {
  isPersistent = false;
  const info: ToolChestPersistenceErrorInfo = {
    error,
    reason,
    isPersistent: false,
  };
  for (const listener of errorListeners) {
    try {
      listener(info);
    } catch (e) {
      console.error('[ToolChest] Error en el oyente de persistencia:', e);
    }
  }
}

/**
 * Inyecta una factoría de IndexedDB personalizada (para pruebas con fake-indexeddb).
 */
export function setCustomIDBFactory(factory: IDBFactory | null): void {
  customFactory = factory;
}

/**
 * Configura la versión objetivo de la base de datos (para pruebas de migración v1 -> v2).
 */
export function setTargetDbVersion(version: number): void {
  targetVersion = version;
}

let lastTimestamp = 0;
function getNextTimestamp(): number {
  const now = Date.now();
  lastTimestamp = Math.max(now, lastTimestamp + 1);
  return lastTimestamp;
}

/**
 * Cierra la base de datos y resetea el estado completo en memoria.
 * Nota: No limpia los oyentes de error registrados por la UI para no desconectar avisos.
 */
export async function resetToolChestService(): Promise<void> {
  if (activeDb) {
    try {
      activeDb.close();
    } catch (_) {}
    activeDb = null;
  }
  isPersistent = true;
  targetVersion = CURRENT_TOOL_CHEST_DB_VERSION;
  inMemoryPalettes.clear();
  inMemoryTools.clear();
  inMemoryRecentTools = [];
}

/**
 * Gestiona la evolución del esquema en onupgradeneeded.
 */
export function handleUpgradeNeeded(
  db: IDBDatabase,
  oldVersion: number,
  newVersion: number | null,
  transaction?: IDBTransaction | null
): void {
  // Esquema v1
  if (oldVersion < 1) {
    if (!db.objectStoreNames.contains(PALETTES_STORE)) {
      const paletteStore = db.createObjectStore(PALETTES_STORE, { keyPath: 'id' });
      paletteStore.createIndex('order', 'order', { unique: false });
    }

    if (!db.objectStoreNames.contains(TOOLS_STORE)) {
      const toolStore = db.createObjectStore(TOOLS_STORE, { keyPath: 'id' });
      toolStore.createIndex('paletteId', 'paletteId', { unique: false });
      toolStore.createIndex('order', 'order', { unique: false });
      toolStore.createIndex('paletteId_order', ['paletteId', 'order'], { unique: false });
    }

    if (!db.objectStoreNames.contains(RECENT_TOOLS_STORE)) {
      const recentStore = db.createObjectStore(RECENT_TOOLS_STORE, { keyPath: 'id' });
      recentStore.createIndex('timestamp', 'timestamp', { unique: false });
    }
  }

  // Esquema v2: Condición 6 (Migración definida desde el inicio)
  if (oldVersion < 2 && (newVersion === null || newVersion >= 2)) {
    if (!db.objectStoreNames.contains('tags')) {
      db.createObjectStore('tags', { keyPath: 'id' });
    }
    if (transaction && db.objectStoreNames.contains(TOOLS_STORE)) {
      const toolStore = transaction.objectStore(TOOLS_STORE);
      if (!toolStore.indexNames.contains('type')) {
        toolStore.createIndex('type', 'type', { unique: false });
      }
    }
  }
}

/**
 * Obtiene la conexión activa a IndexedDB o abre una nueva con fallback a memoria.
 */
async function getDB(): Promise<IDBDatabase | null> {
  if (!isPersistent) {
    return null;
  }

  if (activeDb) {
    return activeDb;
  }

  const factory =
    customFactory ||
    (typeof window !== 'undefined' && window.indexedDB) ||
    (typeof indexedDB !== 'undefined' ? indexedDB : null);

  if (!factory) {
    notifyToolChestError(
      new Error('IndexedDB is not available in this environment'),
      'unavailable'
    );
    return null;
  }

  return new Promise((resolve) => {
    try {
      const request = factory.open(TOOL_CHEST_DB_NAME, targetVersion);

      request.onblocked = () => {
        notifyToolChestError(
          new Error('The Tool Chest database is blocked'),
          'blocked'
        );
      };

      request.onupgradeneeded = (event) => {
        const db = request.result;
        handleUpgradeNeeded(
          db,
          event.oldVersion,
          event.newVersion,
          request.transaction
        );
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          activeDb = null;
        };
        activeDb = db;
        resolve(db);
      };

      request.onerror = () => {
        const err = request.error || new Error('Failed to open IndexedDB');
        notifyToolChestError(err, 'openError');
        resolve(null);
      };
    } catch (err: any) {
      notifyToolChestError(
        err instanceof Error ? err : new Error(String(err)),
        'openError'
      );
      resolve(null);
    }
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Request failed'));
  });
}

// ---------------------------------------------------------------------------
// OPERACIONES DE PALETAS
// ---------------------------------------------------------------------------

export async function getPalettes(): Promise<ToolChestPalette[]> {
  const db = await getDB();

  if (db && isPersistent) {
    try {
      const tx = db.transaction(PALETTES_STORE, 'readonly');
      const store = tx.objectStore(PALETTES_STORE);
      const req = store.getAll();
      const list = await requestToPromise<ToolChestPalette[]>(req);

      if (list && list.length > 0) {
        list.forEach((p) => inMemoryPalettes.set(p.id, { ...p }));
        return list
          .sort((a, b) => a.order - b.order)
          .map((p) => ({ ...p }));
      }
    } catch (err: any) {
      const isQuota = err.name === 'QuotaExceededError';
      notifyToolChestError(
        err instanceof Error ? err : new Error(String(err)),
        isQuota ? 'quotaExceeded' : 'transactionError'
      );
    }
  }

  // Si no hay datos en memoria ni en DB, creamos la paleta por defecto
  if (inMemoryPalettes.size === 0) {
    const defaultPalette: ToolChestPalette = {
      id: DEFAULT_PALETTE_ID,
      name: DEFAULT_PALETTE_NAME,
      isDefault: true,
      order: 0,
      createdAt: new Date().toISOString(),
    };
    inMemoryPalettes.set(defaultPalette.id, defaultPalette);

    if (db && isPersistent) {
      try {
        const tx = db.transaction(PALETTES_STORE, 'readwrite');
        tx.objectStore(PALETTES_STORE).put(defaultPalette);
      } catch (_) {}
    }

    return [{ ...defaultPalette }];
  }

  return Array.from(inMemoryPalettes.values())
    .sort((a, b) => a.order - b.order)
    .map((p) => ({ ...p }));
}

export async function createPalette(
  data: CreatePaletteInput
): Promise<ToolChestPalette> {
  const newPalette: ToolChestPalette = {
    id: data.id || uuidv4(),
    name: data.name,
    isDefault: data.isDefault || false,
    order: data.order !== undefined ? data.order : inMemoryPalettes.size,
    createdAt: data.createdAt || new Date().toISOString(),
  };

  inMemoryPalettes.set(newPalette.id, { ...newPalette });

  const db = await getDB();
  if (db && isPersistent) {
    try {
      const tx = db.transaction(PALETTES_STORE, 'readwrite');
      tx.onabort = () => {
        const err = tx.error || new Error('Transaction aborted');
        notifyToolChestError(
          err,
          err.name === 'QuotaExceededError' ? 'quotaExceeded' : 'transactionError'
        );
      };
      tx.onerror = () => {
        const err = tx.error || new Error('Transaction error');
        notifyToolChestError(
          err,
          err.name === 'QuotaExceededError' ? 'quotaExceeded' : 'transactionError'
        );
      };
      const store = tx.objectStore(PALETTES_STORE);
      await requestToPromise(store.put(newPalette));
    } catch (err: any) {
      notifyToolChestError(
        err instanceof Error ? err : new Error(String(err)),
        err.name === 'QuotaExceededError' ? 'quotaExceeded' : 'transactionError'
      );
    }
  }

  return { ...newPalette };
}

export async function updatePalette(
  id: string,
  updates: Partial<Pick<ToolChestPalette, 'name' | 'order'>>
): Promise<ToolChestPalette> {
  const current = inMemoryPalettes.get(id);
  if (!current) {
    throw new Error(`Palette not found: ${id}`);
  }

  const updated: ToolChestPalette = {
    ...current,
    ...updates,
  };
  inMemoryPalettes.set(id, updated);

  const db = await getDB();
  if (db && isPersistent) {
    try {
      const tx = db.transaction(PALETTES_STORE, 'readwrite');
      const store = tx.objectStore(PALETTES_STORE);
      await requestToPromise(store.put(updated));
    } catch (err: any) {
      notifyToolChestError(
        err instanceof Error ? err : new Error(String(err)),
        err.name === 'QuotaExceededError' ? 'quotaExceeded' : 'transactionError'
      );
    }
  }

  return { ...updated };
}

export async function deletePalette(id: string): Promise<void> {
  inMemoryPalettes.delete(id);

  // Eliminar también las herramientas asociadas
  for (const [toolId, tool] of inMemoryTools.entries()) {
    if (tool.paletteId === id) {
      inMemoryTools.delete(toolId);
    }
  }

  const db = await getDB();
  if (db && isPersistent) {
    try {
      const tx = db.transaction([PALETTES_STORE, TOOLS_STORE], 'readwrite');
      const paletteStore = tx.objectStore(PALETTES_STORE);
      const toolStore = tx.objectStore(TOOLS_STORE);

      paletteStore.delete(id);

      const index = toolStore.index('paletteId');
      const req = index.getAllKeys(id);
      req.onsuccess = () => {
        const keys = req.result;
        for (const k of keys) {
          toolStore.delete(k);
        }
      };
    } catch (err: any) {
      notifyToolChestError(
        err instanceof Error ? err : new Error(String(err)),
        err.name === 'QuotaExceededError' ? 'quotaExceeded' : 'transactionError'
      );
    }
  }
}

export async function reorderPalettes(orderedIds: string[]): Promise<void> {
  orderedIds.forEach((id, index) => {
    const pal = inMemoryPalettes.get(id);
    if (pal) {
      inMemoryPalettes.set(id, { ...pal, order: index });
    }
  });

  const db = await getDB();
  if (db && isPersistent) {
    try {
      const tx = db.transaction(PALETTES_STORE, 'readwrite');
      const store = tx.objectStore(PALETTES_STORE);
      for (const id of orderedIds) {
        const pal = inMemoryPalettes.get(id);
        if (pal) {
          store.put(pal);
        }
      }
    } catch (err: any) {
      notifyToolChestError(
        err instanceof Error ? err : new Error(String(err)),
        err.name === 'QuotaExceededError' ? 'quotaExceeded' : 'transactionError'
      );
    }
  }
}

// ---------------------------------------------------------------------------
// OPERACIONES DE HERRAMIENTAS
// ---------------------------------------------------------------------------

export async function getTools(paletteId?: string): Promise<ToolChestTool[]> {
  const db = await getDB();

  if (db && isPersistent) {
    try {
      const tx = db.transaction(TOOLS_STORE, 'readonly');
      const store = tx.objectStore(TOOLS_STORE);
      let list: ToolChestTool[];

      if (paletteId) {
        const index = store.index('paletteId');
        list = await requestToPromise<ToolChestTool[]>(index.getAll(paletteId));
      } else {
        list = await requestToPromise<ToolChestTool[]>(store.getAll());
      }

      list.forEach((t) => inMemoryTools.set(t.id, { ...t }));
      return list
        .sort((a, b) => a.order - b.order)
        .map((t) => ({ ...t }));
    } catch (err: any) {
      notifyToolChestError(
        err instanceof Error ? err : new Error(String(err)),
        err.name === 'QuotaExceededError' ? 'quotaExceeded' : 'transactionError'
      );
    }
  }

  const all = Array.from(inMemoryTools.values());
  const filtered = paletteId ? all.filter((t) => t.paletteId === paletteId) : all;
  return filtered
    .sort((a, b) => a.order - b.order)
    .map((t) => ({ ...t }));
}

export async function getTool(id: string): Promise<ToolChestTool | null> {
  const cached = inMemoryTools.get(id);
  if (cached) {
    return { ...cached };
  }

  const db = await getDB();
  if (db && isPersistent) {
    try {
      const tx = db.transaction(TOOLS_STORE, 'readonly');
      const store = tx.objectStore(TOOLS_STORE);
      const tool = await requestToPromise<ToolChestTool | undefined>(store.get(id));
      if (tool) {
        inMemoryTools.set(tool.id, { ...tool });
        return { ...tool };
      }
    } catch (err: any) {
      notifyToolChestError(
        err instanceof Error ? err : new Error(String(err)),
        err.name === 'QuotaExceededError' ? 'quotaExceeded' : 'transactionError'
      );
    }
  }

  return null;
}

export async function createTool(
  data: CreateToolInput
): Promise<ToolChestTool> {
  const toolsInPalette = Array.from(inMemoryTools.values()).filter(
    (t) => t.paletteId === data.paletteId
  );
  const nextOrder =
    data.order !== undefined
      ? data.order
      : toolsInPalette.reduce((max, t) => Math.max(max, t.order), -1) + 1;

  const newTool: ToolChestTool = {
    id: data.id || uuidv4(),
    paletteId: data.paletteId,
    name: data.name,
    type: data.type,
    style: { ...data.style },
    text: data.text,
    textFormat: data.textFormat ? { ...data.textFormat } : undefined,
    order: nextOrder,
    mode: data.mode || 'drawing',
    createdAt: data.createdAt || new Date().toISOString(),
  };

  inMemoryTools.set(newTool.id, { ...newTool });

  const db = await getDB();
  if (db && isPersistent) {
    try {
      const tx = db.transaction(TOOLS_STORE, 'readwrite');
      tx.onabort = () => {
        const err = tx.error || new Error('Transaction aborted');
        notifyToolChestError(
          err,
          err.name === 'QuotaExceededError' ? 'quotaExceeded' : 'transactionError'
        );
      };
      tx.onerror = () => {
        const err = tx.error || new Error('Transaction error');
        notifyToolChestError(
          err,
          err.name === 'QuotaExceededError' ? 'quotaExceeded' : 'transactionError'
        );
      };
      const store = tx.objectStore(TOOLS_STORE);
      await requestToPromise(store.put(newTool));
    } catch (err: any) {
      notifyToolChestError(
        err instanceof Error ? err : new Error(String(err)),
        err.name === 'QuotaExceededError' ? 'quotaExceeded' : 'transactionError'
      );
    }
  }

  return { ...newTool };
}

export async function updateTool(
  id: string,
  updates: Partial<Omit<ToolChestTool, 'id' | 'createdAt'>>
): Promise<ToolChestTool> {
  const current = inMemoryTools.get(id);
  if (!current) {
    throw new Error(`Tool not found: ${id}`);
  }

  const updated: ToolChestTool = {
    ...current,
    ...updates,
    style: updates.style ? { ...updates.style } : current.style,
    textFormat: updates.textFormat
      ? { ...updates.textFormat }
      : current.textFormat,
  };
  inMemoryTools.set(id, updated);

  const db = await getDB();
  if (db && isPersistent) {
    try {
      const tx = db.transaction(TOOLS_STORE, 'readwrite');
      const store = tx.objectStore(TOOLS_STORE);
      await requestToPromise(store.put(updated));
    } catch (err: any) {
      notifyToolChestError(
        err instanceof Error ? err : new Error(String(err)),
        err.name === 'QuotaExceededError' ? 'quotaExceeded' : 'transactionError'
      );
    }
  }

  return { ...updated };
}

export async function deleteTool(id: string): Promise<void> {
  inMemoryTools.delete(id);

  const db = await getDB();
  if (db && isPersistent) {
    try {
      const tx = db.transaction(TOOLS_STORE, 'readwrite');
      const store = tx.objectStore(TOOLS_STORE);
      await requestToPromise(store.delete(id));
    } catch (err: any) {
      notifyToolChestError(
        err instanceof Error ? err : new Error(String(err)),
        err.name === 'QuotaExceededError' ? 'quotaExceeded' : 'transactionError'
      );
    }
  }
}

export async function reorderTools(
  paletteId: string,
  orderedIds: string[]
): Promise<void> {
  orderedIds.forEach((id, index) => {
    const t = inMemoryTools.get(id);
    if (t && t.paletteId === paletteId) {
      inMemoryTools.set(id, { ...t, order: index });
    }
  });

  const db = await getDB();
  if (db && isPersistent) {
    try {
      const tx = db.transaction(TOOLS_STORE, 'readwrite');
      const store = tx.objectStore(TOOLS_STORE);
      for (const id of orderedIds) {
        const t = inMemoryTools.get(id);
        if (t && t.paletteId === paletteId) {
          store.put(t);
        }
      }
    } catch (err: any) {
      notifyToolChestError(
        err instanceof Error ? err : new Error(String(err)),
        err.name === 'QuotaExceededError' ? 'quotaExceeded' : 'transactionError'
      );
    }
  }
}

export async function moveToolToPalette(
  toolId: string,
  targetPaletteId: string,
  newOrder?: number
): Promise<ToolChestTool> {
  const current = inMemoryTools.get(toolId);
  if (!current) {
    throw new Error(`Tool not found: ${toolId}`);
  }

  const toolsInTarget = Array.from(inMemoryTools.values()).filter(
    (t) => t.paletteId === targetPaletteId
  );
  const targetOrder =
    newOrder !== undefined
      ? newOrder
      : toolsInTarget.reduce((max, t) => Math.max(max, t.order), -1) + 1;

  const moved: ToolChestTool = {
    ...current,
    paletteId: targetPaletteId,
    order: targetOrder,
  };

  inMemoryTools.set(toolId, moved);

  const db = await getDB();
  if (db && isPersistent) {
    try {
      const tx = db.transaction(TOOLS_STORE, 'readwrite');
      const store = tx.objectStore(TOOLS_STORE);
      await requestToPromise(store.put(moved));
    } catch (err: any) {
      notifyToolChestError(
        err instanceof Error ? err : new Error(String(err)),
        err.name === 'QuotaExceededError' ? 'quotaExceeded' : 'transactionError'
      );
    }
  }

  return { ...moved };
}

// ---------------------------------------------------------------------------
// OPERACIONES DE HERRAMIENTAS RECIENTES (DESACOPLADAS Y FIFO)
// ---------------------------------------------------------------------------

/**
 * Registra una herramienta reciente. Totalmente desacoplada: NUNCA lanza excepciones
 * al llamador ni interrumpe la creación de marcas si falla la persistencia.
 */
export async function recordRecentTool(
  source:
    | Markup
    | {
        type: RecentTool['type'];
        style: RecentTool['style'];
        text?: string;
        textFormat?: RecentTool['textFormat'];
        mode?: ToolChestMode;
      }
): Promise<void> {
  try {
    const mode: ToolChestMode =
      'mode' in source && source.mode ? source.mode : 'drawing';

    const recentItem: RecentTool = {
      id: uuidv4(),
      type: source.type,
      style: { ...source.style },
      text: source.text,
      textFormat: source.textFormat ? { ...source.textFormat } : undefined,
      mode,
      timestamp: getNextTimestamp(),
    };

    // Deduplicación en memoria: si ya existe una idéntica en tipo y estilo, se reemplaza para actualizar timestamp
    const filtered = inMemoryRecentTools.filter(
      (item) =>
        !(
          item.type === recentItem.type &&
          item.style.strokeColor === recentItem.style.strokeColor &&
          item.style.fillColor === recentItem.style.fillColor &&
          item.style.strokeWidth === recentItem.style.strokeWidth &&
          item.style.opacity === recentItem.style.opacity &&
          item.text === recentItem.text &&
          item.mode === recentItem.mode
        )
    );

    filtered.unshift(recentItem);
    inMemoryRecentTools = filtered.slice(0, MAX_RECENT_TOOLS);

    const db = await getDB();
    if (db && isPersistent) {
      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(RECENT_TOOLS_STORE, 'readwrite');
          tx.oncomplete = () => resolve();
          tx.onerror = () => {
            const err = tx.error || new Error('Transaction error');
            notifyToolChestError(
              err,
              err.name === 'QuotaExceededError' ? 'quotaExceeded' : 'transactionError'
            );
            resolve();
          };
          tx.onabort = () => {
            const err = tx.error || new Error('Transaction aborted');
            notifyToolChestError(
              err,
              err.name === 'QuotaExceededError' ? 'quotaExceeded' : 'transactionError'
            );
            resolve();
          };

          const store = tx.objectStore(RECENT_TOOLS_STORE);

          // Buscar y eliminar duplicados existentes en el almacén
          const getAllReq = store.getAll();
          getAllReq.onsuccess = () => {
            const list = (getAllReq.result || []) as RecentTool[];
            for (const item of list) {
              if (
                item.type === recentItem.type &&
                item.style.strokeColor === recentItem.style.strokeColor &&
                item.style.fillColor === recentItem.style.fillColor &&
                item.style.strokeWidth === recentItem.style.strokeWidth &&
                item.style.opacity === recentItem.style.opacity &&
                item.text === recentItem.text &&
                item.mode === recentItem.mode
              ) {
                store.delete(item.id);
              }
            }

            // Guardar el nuevo ítem
            store.put(recentItem);

            // Mantener tope FIFO
            const index = store.index('timestamp');
            const allKeysReq = index.getAllKeys();
            allKeysReq.onsuccess = () => {
              const keys = allKeysReq.result;
              if (keys.length > MAX_RECENT_TOOLS) {
                const toDelete = keys.length - MAX_RECENT_TOOLS;
                for (let k = 0; k < toDelete; k++) {
                  store.delete(keys[k]);
                }
              }
            };
          };
        } catch (err: any) {
          notifyToolChestError(
            err instanceof Error ? err : new Error(String(err)),
            err.name === 'QuotaExceededError' ? 'quotaExceeded' : 'transactionError'
          );
          resolve();
        }
      });
    }
  } catch (err) {
    // Aislamiento absoluto: el llamador nunca recibe error
    console.warn('[ToolChest] Fallo no bloqueante al registrar herramienta reciente:', err);
  }
}

export async function getRecentTools(): Promise<RecentTool[]> {
  const db = await getDB();

  if (db && isPersistent) {
    try {
      const tx = db.transaction(RECENT_TOOLS_STORE, 'readonly');
      const store = tx.objectStore(RECENT_TOOLS_STORE);
      const list = await requestToPromise<RecentTool[]>(store.getAll());

      if (list && list.length > 0) {
        inMemoryRecentTools = list
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, MAX_RECENT_TOOLS);
        return inMemoryRecentTools.map((t) => ({ ...t }));
      }
    } catch (err: any) {
      notifyToolChestError(
        err instanceof Error ? err : new Error(String(err)),
        err.name === 'QuotaExceededError' ? 'quotaExceeded' : 'transactionError'
      );
    }
  }

  return inMemoryRecentTools
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_RECENT_TOOLS)
    .map((t) => ({ ...t }));
}

export async function clearRecentTools(): Promise<void> {
  inMemoryRecentTools = [];

  const db = await getDB();
  if (db && isPersistent) {
    try {
      const tx = db.transaction(RECENT_TOOLS_STORE, 'readwrite');
      const store = tx.objectStore(RECENT_TOOLS_STORE);
      await requestToPromise(store.clear());
    } catch (err: any) {
      notifyToolChestError(
        err instanceof Error ? err : new Error(String(err)),
        err.name === 'QuotaExceededError' ? 'quotaExceeded' : 'transactionError'
      );
    }
  }
}
