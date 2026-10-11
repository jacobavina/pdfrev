import fs from 'fs';
import path from 'path';
import { saveIncrementalMarkups } from '../src/core/pdf/incrementalWriter';
import { importPdfAnnotations } from '../src/core/pdf/annotationReader';
import { Markup } from '../src/types/markup';

async function main() {
  console.log('[Interop Sample] Generando muestra-rea.pdf con los 14 tipos de marcas y estados...');

  const fixturePath = path.resolve('fixtures/test-blueprint.pdf');
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`No se encontró el archivo base en ${fixturePath}`);
  }
  const originalBytes = new Uint8Array(fs.readFileSync(fixturePath));

  const sampleMarkups: Markup[] = [
    // 1. Rectangle (Square) - Estado Accepted
    {
      id: 'rea-sample-rect',
      type: 'rectangle',
      pageIndex: 0,
      points: [{ x: 0.05, y: 0.15 }, { x: 0.25, y: 0.3 }],
      style: { strokeColor: '#0055ff', fillColor: '#e0edff', strokeWidth: 2, opacity: 1 },
      text: 'Recinto de Maquinaria Principal',
      author: 'Ing. Estructural',
      status: 'accepted',
      createdAt: '2026-10-11T09:00:00Z',
      updatedAt: '2026-10-11T09:30:00Z',
      customFields: { Disciplina: 'Estructuras', Nivel: 'Planta Baja', AprobadoPor: 'Dirección de Obra' },
    },
    // 2. Circle (Circle) - Estado Rejected
    {
      id: 'rea-sample-circle',
      type: 'circle',
      pageIndex: 0,
      points: [{ x: 0.3, y: 0.15 }, { x: 0.45, y: 0.3 }],
      style: { strokeColor: '#e02424', fillColor: '#fee2e2', strokeWidth: 2, opacity: 1 },
      text: 'Pasamuros no conforme a norma acústica',
      author: 'Auditor Acústico',
      status: 'rejected',
      createdAt: '2026-10-11T09:15:00Z',
      updatedAt: '2026-10-11T10:00:00Z',
      customFields: { Disciplina: 'Instalaciones', Reinspeccion: 'Obligatoria' },
    },
    // 3. Line (Line) - Estado Completed
    {
      id: 'rea-sample-line',
      type: 'line',
      pageIndex: 0,
      points: [{ x: 0.5, y: 0.2 }, { x: 0.7, y: 0.2 }],
      style: { strokeColor: '#16a34a', strokeWidth: 3, opacity: 1 },
      text: 'Eje de replanteo alineado',
      author: 'Topógrafo Jefe',
      status: 'completed',
      createdAt: '2026-10-11T08:00:00Z',
      updatedAt: '2026-10-11T08:45:00Z',
      customFields: { ToleranciaMm: '2.0' },
    },
    // 4. Polygon (Polygon) - Estado Cancelled
    {
      id: 'rea-sample-polygon',
      type: 'polygon',
      pageIndex: 0,
      points: [
        { x: 0.75, y: 0.15 },
        { x: 0.9, y: 0.2 },
        { x: 0.85, y: 0.3 },
        { x: 0.75, y: 0.25 },
      ],
      style: { strokeColor: '#d97706', fillColor: '#fef3c7', strokeWidth: 1.5, opacity: 1 },
      text: 'Solera de hormigón descartada por modificación de proyecto',
      author: 'Jefe de Oficina Técnica',
      status: 'cancelled',
      createdAt: '2026-10-11T07:30:00Z',
      updatedAt: '2026-10-11T08:00:00Z',
      customFields: { ModificacionNum: 'MOD-04' },
    },
    // 5. Cloud (Polygon /BE)
    {
      id: 'rea-sample-cloud',
      type: 'cloud',
      pageIndex: 0,
      points: [
        { x: 0.05, y: 0.35 },
        { x: 0.28, y: 0.35 },
        { x: 0.28, y: 0.5 },
        { x: 0.05, y: 0.5 },
      ],
      style: { strokeColor: '#dc2626', strokeWidth: 2, opacity: 1 },
      text: 'Revisión obligatoria de refuerzos de esquina',
      author: 'Revisor de Seguridad',
      status: 'pending',
      createdAt: '2026-10-11T10:00:00Z',
      updatedAt: '2026-10-11T10:00:00Z',
      customFields: { arcStep: 24, Prioridad: 'Muy Alta' },
    },
    // 6. CloudPlus (Cloud con llamada)
    {
      id: 'rea-sample-cloudplus',
      type: 'cloudPlus',
      pageIndex: 0,
      points: [
        { x: 0.32, y: 0.35 },
        { x: 0.55, y: 0.35 },
        { x: 0.55, y: 0.5 },
        { x: 0.32, y: 0.5 },
      ],
      style: { strokeColor: '#7c3aed', strokeWidth: 2, opacity: 1 },
      text: 'Nube con leyenda: Confirmar cota de coronación +12.45m',
      author: 'Arquitecto Proyectista',
      status: 'pending',
      createdAt: '2026-10-11T10:10:00Z',
      updatedAt: '2026-10-11T10:10:00Z',
      customFields: { arcStep: 22 },
    },
    // 7. Callout (Llamada técnica con directriz)
    {
      id: 'rea-sample-callout',
      type: 'callout',
      pageIndex: 0,
      points: [{ x: 0.6, y: 0.35 }, { x: 0.75, y: 0.45 }],
      style: { strokeColor: '#2563eb', fillColor: '#eff6ff', strokeWidth: 1.5, opacity: 1, fontSize: 10 },
      text: 'Detalle de encuentro viga-pilar según plano DET-03',
      author: 'Calculista',
      status: 'accepted',
      createdAt: '2026-10-11T10:20:00Z',
      updatedAt: '2026-10-11T10:20:00Z',
    },
    // 8. StickyNote (Nota adhesiva /Text)
    {
      id: 'rea-sample-stickynote',
      type: 'stickyNote',
      pageIndex: 0,
      points: [{ x: 0.82, y: 0.38 }],
      style: { strokeColor: '#eab308', fillColor: '#fef9c3', strokeWidth: 1, opacity: 1 },
      text: 'Comprobar resistencia de hormigón a 28 días (HA-30)',
      author: 'Laboratorio de Control',
      status: 'completed',
      createdAt: '2026-10-11T10:30:00Z',
      updatedAt: '2026-10-11T10:30:00Z',
    },
    // 9. Text (Texto libre /FreeText)
    {
      id: 'rea-sample-text',
      type: 'text',
      pageIndex: 0,
      points: [{ x: 0.05, y: 0.55 }, { x: 0.3, y: 0.65 }],
      style: { strokeColor: '#111827', strokeWidth: 1, opacity: 1, fontSize: 12 },
      text: 'NOTA: Todos los perfiles de acero galvanizado en caliente según UNE-EN ISO 1461.',
      author: 'Director de Ejecución',
      status: 'pending',
      createdAt: '2026-10-11T10:40:00Z',
      updatedAt: '2026-10-11T10:40:00Z',
    },
    // 10. Freehand (Trazo a mano alzada /Ink)
    {
      id: 'rea-sample-freehand',
      type: 'freehand',
      pageIndex: 0,
      points: [
        { x: 0.35, y: 0.58 },
        { x: 0.38, y: 0.60 },
        { x: 0.42, y: 0.57 },
        { x: 0.45, y: 0.61 },
        { x: 0.48, y: 0.58 },
      ],
      style: { strokeColor: '#059669', strokeWidth: 2.5, opacity: 1 },
      text: 'Firma y visto bueno de inspección visual en obra',
      author: 'Jefe de Obra',
      status: 'accepted',
      createdAt: '2026-10-11T11:00:00Z',
      updatedAt: '2026-10-11T11:00:00Z',
    },
    // 11. HighlightVector (Resaltador poligonal)
    {
      id: 'rea-sample-highlight-vec',
      type: 'highlightVector',
      pageIndex: 0,
      points: [{ x: 0.52, y: 0.55 }, { x: 0.72, y: 0.62 }],
      style: { strokeColor: '#facc15', fillColor: '#fef08a', strokeWidth: 1, opacity: 0.5 },
      text: 'Zona de paso de evacuación protegida',
      author: 'Consultor PCI',
      status: 'pending',
      createdAt: '2026-10-11T11:10:00Z',
      updatedAt: '2026-10-11T11:10:00Z',
    },
    // 12. HighlightText (Resaltador de texto)
    {
      id: 'rea-sample-highlight-txt',
      type: 'highlightText',
      pageIndex: 0,
      points: [{ x: 0.75, y: 0.55 }, { x: 0.95, y: 0.62 }],
      style: { strokeColor: '#38bdf8', fillColor: '#bae6fd', strokeWidth: 1, opacity: 0.5 },
      text: 'Texto resaltado de especificación técnica',
      author: 'Revisor Pliego',
      status: 'pending',
      createdAt: '2026-10-11T11:15:00Z',
      updatedAt: '2026-10-11T11:15:00Z',
    },
    // 13. PolyLine como Polygon con bandera isPolyLine
    {
      id: 'rea-sample-polyline',
      type: 'polygon',
      pageIndex: 0,
      points: [
        { x: 0.05, y: 0.72 },
        { x: 0.18, y: 0.78 },
        { x: 0.28, y: 0.72 },
        { x: 0.4, y: 0.8 },
      ],
      style: { strokeColor: '#8b5cf6', strokeWidth: 2, opacity: 1 },
      text: 'Trazado previsto de bandeja eléctrica de fuerza',
      author: 'Ing. Telecomunicaciones',
      status: 'pending',
      createdAt: '2026-10-11T11:20:00Z',
      updatedAt: '2026-10-11T11:20:00Z',
      customFields: { isPolyLine: 'true' },
    },
  ];

  const updatedBytes = await saveIncrementalMarkups(originalBytes, sampleMarkups);

  // Validar invariante dura
  if (updatedBytes.length <= originalBytes.length) {
    throw new Error('El archivo actualizado no contiene datos adicionales');
  }
  for (let i = 0; i < originalBytes.length; i++) {
    if (updatedBytes[i] !== originalBytes[i]) {
      throw new Error(`Violación de invariante: byte en offset ${i} no coincide`);
    }
  }

  // Validar que se puedan leer las marcas de regreso
  const readBack = await importPdfAnnotations(updatedBytes);
  if (readBack.markups.length !== sampleMarkups.length) {
    throw new Error(
      `Fallo de round-trip: se esperaban ${sampleMarkups.length} marcas pero se leyeron ${readBack.markups.length}`
    );
  }

  const outDir = path.resolve('plan/interop');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outPdf = path.join(outDir, 'muestra-rea.pdf');
  fs.writeFileSync(outPdf, updatedBytes);

  console.log(`[Interop Sample] Archivo generado exitosamente en: ${outPdf}`);
  console.log(`[Interop Sample] Tamaño original: ${originalBytes.length} bytes, Tamaño final: ${updatedBytes.length} bytes`);
  console.log(`[Interop Sample] Marcas importadas: ${readBack.markups.length}, No soportadas: ${readBack.foreignUnsupportedCount}`);
}

main().catch((err) => {
  console.error('[Interop Sample] Error:', err);
  process.exit(1);
});
