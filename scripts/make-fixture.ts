import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

export interface FixtureMeta {
  pageCount: number;
  pageSize: { width: number; height: number };
  knownRectangle: {
    // PDF coordinates (bottom-left origin)
    pdf: { x: number; y: number; width: number; height: number };
    // Normalized screen coordinates (top-left origin [0..1])
    normalized: { x: number; y: number; width: number; height: number };
    strokeColor: string;
    fillColor: string;
    strokeWidth: number;
  };
}

export async function generateTestPdf(outputPath: string): Promise<FixtureMeta> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_WIDTH = 800;
  const PAGE_HEIGHT = 600;

  // Known rectangle dimensions in PDF coordinates (origin at bottom-left)
  const rectPdf = {
    x: 100,
    y: 150,
    width: 300,
    height: 200,
  };

  // Normalized coordinates with top-left origin (standard UI/screen space)
  // top in PDF is y + height = 150 + 200 = 350.
  // In top-left system: yTopLeft = PAGE_HEIGHT - (rectPdf.y + rectPdf.height) = 600 - 350 = 250.
  const rectNormalized = {
    x: rectPdf.x / PAGE_WIDTH, // 0.125
    y: (PAGE_HEIGHT - (rectPdf.y + rectPdf.height)) / PAGE_HEIGHT, // 250 / 600 ≈ 0.4166667
    width: rectPdf.width / PAGE_WIDTH, // 0.375
    height: rectPdf.height / PAGE_HEIGHT, // 0.3333333
  };

  // --- PÁGINA 1: Plano con rectángulo de calibración ---
  const page1 = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  // Title
  page1.drawText('PLANO DE PRUEBA - CALIBRACIÓN TÉCNICA (PÁGINA 1)', {
    x: 50,
    y: 550,
    size: 18,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.15),
  });

  page1.drawText(`Dimensiones de página: ${PAGE_WIDTH}pt x ${PAGE_HEIGHT}pt`, {
    x: 50,
    y: 530,
    size: 11,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });

  // Background Grid Lines
  for (let x = 50; x < PAGE_WIDTH; x += 100) {
    page1.drawLine({
      start: { x, y: 50 },
      end: { x, y: 500 },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.88),
    });
    page1.drawText(`${x}`, { x: x - 8, y: 35, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
  }

  for (let y = 50; y < 520; y += 100) {
    page1.drawLine({
      start: { x: 50, y },
      end: { x: PAGE_WIDTH - 50, y },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.88),
    });
    page1.drawText(`${y}`, { x: 25, y: y - 3, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
  }

  // Draw Known Rectangle
  page1.drawRectangle({
    x: rectPdf.x,
    y: rectPdf.y,
    width: rectPdf.width,
    height: rectPdf.height,
    borderWidth: 2,
    borderColor: rgb(0.85, 0.15, 0.15), // Red
    color: rgb(0.85, 0.92, 1.0), // Light blue fill
    opacity: 0.8,
  });

  // Label inside rectangle
  page1.drawText('RECTÁNGULO DE CONTROL', {
    x: rectPdf.x + 20,
    y: rectPdf.y + rectPdf.height - 35,
    size: 14,
    font: boldFont,
    color: rgb(0.85, 0.15, 0.15),
  });

  page1.drawText(`PDF: x=${rectPdf.x}, y=${rectPdf.y}, w=${rectPdf.width}, h=${rectPdf.height}`, {
    x: rectPdf.x + 20,
    y: rectPdf.y + rectPdf.height - 60,
    size: 10,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });

  page1.drawText(
    `Norm: x=${rectNormalized.x.toFixed(4)}, y=${rectNormalized.y.toFixed(4)}, w=${rectNormalized.width.toFixed(4)}, h=${rectNormalized.height.toFixed(4)}`,
    {
      x: rectPdf.x + 20,
      y: rectPdf.y + rectPdf.height - 80,
      size: 10,
      font,
      color: rgb(0.2, 0.2, 0.2),
    }
  );

  // --- PÁGINA 2: Especificaciones y notas ---
  const page2 = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  page2.drawText('ESPECIFICACIONES Y NOTAS DE REVISIÓN (PÁGINA 2)', {
    x: 50,
    y: 550,
    size: 18,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.15),
  });

  page2.drawText('Esta segunda página valida la navegación multipágina y thumbnails.', {
    x: 50,
    y: 520,
    size: 12,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });

  // Draw some sample geometry on page 2
  page2.drawCircle({
    x: 400,
    y: 300,
    size: 80,
    borderWidth: 2,
    borderColor: rgb(0.1, 0.6, 0.2),
    color: rgb(0.9, 0.98, 0.9),
  });

  page2.drawText('Zona de Inspección Verde (Radio=80)', {
    x: 310,
    y: 295,
    size: 11,
    font,
    color: rgb(0.1, 0.4, 0.1),
  });

  // Save PDF
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, pdfBytes);

  const meta: FixtureMeta = {
    pageCount: 2,
    pageSize: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
    knownRectangle: {
      pdf: rectPdf,
      normalized: rectNormalized,
      strokeColor: '#d92626',
      fillColor: '#d9ebff',
      strokeWidth: 2,
    },
  };

  const metaPath = outputPath.replace(/\.pdf$/, '.meta.json');
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');

  console.log(`[fixture] PDF generado exitosamente en: ${outputPath}`);
  console.log(`[fixture] Metadatos guardados en: ${metaPath}`);
  console.log(`[fixture] Rectángulo de control:`, meta.knownRectangle);

  return meta;
}

export async function generateRotatedTestPdf(outputPath: string): Promise<FixtureMeta> {
  const pdfDoc = await PDFDocument.create();
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_WIDTH = 800;
  const PAGE_HEIGHT = 600;

  // Rectángulo conocido en coordenadas nativas PDF (origen inferior-izquierdo)
  const rectPdf = {
    x: 100,
    y: 150,
    width: 300,
    height: 200,
  };

  // Coordenadas normalizadas con rotación de 90° (viewport visible: ancho=600, alto=800)
  // u = y_pdf / PAGE_HEIGHT = 150 / 600 = 0.25
  // v = x_pdf / PAGE_WIDTH = 100 / 800 = 0.125
  // normWidth = rectPdf.height / PAGE_HEIGHT = 200 / 600 = 1/3
  // normHeight = rectPdf.width / PAGE_WIDTH = 300 / 800 = 0.375
  const rectNormalized = {
    x: 0.25,
    y: 0.125,
    width: 200 / PAGE_HEIGHT,
    height: 300 / PAGE_WIDTH,
  };

  // PÁGINA 1: Rotada intrínsecamente a 90° (/Rotate 90)
  const page1 = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  page1.setRotation(degrees(90));

  page1.drawRectangle({
    x: rectPdf.x,
    y: rectPdf.y,
    width: rectPdf.width,
    height: rectPdf.height,
    borderWidth: 2,
    borderColor: rgb(0.85, 0.15, 0.15),
    color: rgb(0.85, 0.92, 1.0),
    opacity: 0.8,
  });

  page1.drawText('PLANO ROTADO 90° - CALIBRACIÓN TÉCNICA (PÁGINA 1)', {
    x: 50,
    y: 550,
    size: 18,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.15),
  });

  page1.drawText('RECTÁNGULO DE CONTROL ROTADO', {
    x: rectPdf.x + 20,
    y: rectPdf.y + rectPdf.height - 35,
    size: 14,
    font: boldFont,
    color: rgb(0.85, 0.15, 0.15),
  });

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, pdfBytes);

  const meta: FixtureMeta = {
    pageCount: 1,
    pageSize: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
    knownRectangle: {
      pdf: rectPdf,
      normalized: rectNormalized,
      strokeColor: '#d92626',
      fillColor: '#d9ebff',
      strokeWidth: 2,
    },
  };

  const metaPath = outputPath.replace(/\.pdf$/, '.meta.json');
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');

  console.log(`[fixture] PDF rotado generado exitosamente en: ${outputPath}`);
  console.log(`[fixture] Metadatos guardados en: ${metaPath}`);

  return meta;
}

// Direct execution
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const targetNormal = path.resolve(process.cwd(), 'fixtures/test-blueprint.pdf');
  const targetRotated = path.resolve(process.cwd(), 'fixtures/test-blueprint-rotated.pdf');

  Promise.all([
    // Solo generar test-blueprint.pdf si no existe para no tocarlo innecesariamente
    fs.existsSync(targetNormal) ? Promise.resolve() : generateTestPdf(targetNormal),
    generateRotatedTestPdf(targetRotated),
  ]).catch((err) => {
    console.error('Error generando fixtures PDF:', err);
    process.exit(1);
  });
}
