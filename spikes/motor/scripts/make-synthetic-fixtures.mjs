import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb, degrees, StandardFonts, PDFName, PDFDict, PDFArray, PDFString, PDFHexString } from 'pdf-lib';

const FIXTURES_DIR = path.resolve('./spikes/motor/fixtures');

export async function generateAllFixtures(options = { includeLarge: true }) {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  console.log('[FIXTURES] Generando fixtures sintéticos en', FIXTURES_DIR);

  // 1. Classic xref (sin object streams, tabla xref estándar)
  {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 400]);
    page.drawText('Fixture: Classic XRef Table (PDF 1.4)', { x: 50, y: 350, size: 14 });
    const bytes = await pdfDoc.save({ useObjectStreams: false });
    fs.writeFileSync(path.join(FIXTURES_DIR, 'classic-xref.pdf'), bytes);
    console.log(' - classic-xref.pdf generado');
  }

  // 2. Xref stream (PDF 1.5 con stream de referencias cruzadas)
  {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 400]);
    page.drawText('Fixture: XRef Stream (PDF 1.5)', { x: 50, y: 350, size: 14 });
    const bytes = await pdfDoc.save({ useObjectStreams: true });
    fs.writeFileSync(path.join(FIXTURES_DIR, 'xref-stream.pdf'), bytes);
    console.log(' - xref-stream.pdf generado');
  }

  // 3. Object streams (objetos comprimidos dentro de ObjStm)
  {
    const pdfDoc = await PDFDocument.create();
    for (let i = 0; i < 5; i++) {
      const page = pdfDoc.addPage([600, 400]);
      page.drawText(`Fixture: Object Streams - Pagina ${i + 1}`, { x: 50, y: 350, size: 14 });
    }
    const bytes = await pdfDoc.save({ useObjectStreams: true });
    fs.writeFileSync(path.join(FIXTURES_DIR, 'object-streams.pdf'), bytes);
    console.log(' - object-streams.pdf generado');
  }

  // 4. Linearizado (diccionario /Linearized inicial)
  {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 400]);
    page.drawText('Fixture: Linearized PDF', { x: 50, y: 350, size: 14 });
    const baseBytes = await pdfDoc.save({ useObjectStreams: false });
    // Inyectamos diccionario /Linearized sintético tras la cabecera %PDF-1.4
    const headerEnd = baseBytes.indexOf(10) + 1; // primer salto de linea
    const linObj = Buffer.from(
      `1 0 obj\n<< /Linearized 1.0 /L ${baseBytes.length + 150} /H [ 600 200 ] /O 3 /E ${baseBytes.length + 150} /N 1 /T ${baseBytes.length + 100} >>\nendobj\n`
    );
    const combined = Buffer.concat([
      baseBytes.subarray(0, headerEnd),
      linObj,
      baseBytes.subarray(headerEnd)
    ]);
    fs.writeFileSync(path.join(FIXTURES_DIR, 'linearized.pdf'), combined);
    console.log(' - linearized.pdf generado');
  }

  // 5. Con /Annots previas
  {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 400]);
    page.drawText('Fixture: With Prior Annotations', { x: 50, y: 350, size: 14 });

    // Añadir anotación /Square en la página
    const context = pdfDoc.context;
    const annotDict = context.obj({
      Type: 'Annot',
      Subtype: 'Square',
      Rect: [100, 100, 300, 250],
      Contents: PDFString.of('Anotacion previa existente'),
      NM: PDFString.of('annot-previa-1'),
      C: [1, 0, 0],
      CA: 0.8,
    });
    const annotRef = context.register(annotDict);
    page.node.set(PDFName.of('Annots'), context.obj([annotRef]));

    const bytes = await pdfDoc.save({ useObjectStreams: false });
    fs.writeFileSync(path.join(FIXTURES_DIR, 'with-annots.pdf'), bytes);
    console.log(' - with-annots.pdf generado');
  }

  // 6. Con firma digital simulada (/Sig sin cripto real)
  {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 400]);
    page.drawText('Fixture: Simulated Digital Signature', { x: 50, y: 350, size: 14 });

    const context = pdfDoc.context;
    const sigValueDict = context.obj({
      Type: 'Sig',
      Filter: 'Adobe.PPKLite',
      SubFilter: 'adbe.pkcs7.detached',
      Contents: PDFHexString.of('00000000000000000000000000000000'),
      ByteRange: [0, 1000, 1500, 2000],
      M: PDFString.of("D:20261011120000Z"),
      Name: PDFString.of('Inspector de Obra'),
      Reason: PDFString.of('Aprobacion tecnica de plano'),
    });
    const sigValueRef = context.register(sigValueDict);

    const sigFieldDict = context.obj({
      Type: 'Annot',
      Subtype: 'Widget',
      FT: 'Sig',
      Rect: [50, 50, 200, 100],
      T: PDFString.of('FirmaTecnica_1'),
      V: sigValueRef,
      P: page.node,
    });
    const sigFieldRef = context.register(sigFieldDict);
    page.node.set(PDFName.of('Annots'), context.obj([sigFieldRef]));

    const acroFormDict = context.obj({
      Fields: [sigFieldRef],
      SigFlags: 3,
    });
    pdfDoc.catalog.set(PDFName.of('AcroForm'), context.register(acroFormDict));

    const bytes = await pdfDoc.save({ useObjectStreams: false });
    fs.writeFileSync(path.join(FIXTURES_DIR, 'simulated-signature.pdf'), bytes);
    console.log(' - simulated-signature.pdf generado');
  }

  // 7. Página con /Rotate 90
  {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 400]);
    page.setRotation(degrees(90));
    page.drawText('Fixture: Pagina con /Rotate 90', { x: 50, y: 350, size: 14 });
    const bytes = await pdfDoc.save({ useObjectStreams: false });
    fs.writeFileSync(path.join(FIXTURES_DIR, 'rotated-90.pdf'), bytes);
    console.log(' - rotated-90.pdf generado');
  }

  // 8. CropBox != MediaBox
  {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([1000, 1000]);
    page.drawText('Fixture: CropBox != MediaBox (Area util 100..900)', { x: 150, y: 850, size: 16 });
    // MediaBox ya es [0, 0, 1000, 1000]
    page.node.set(PDFName.of('CropBox'), pdfDoc.context.obj([100, 100, 900, 900]));
    const bytes = await pdfDoc.save({ useObjectStreams: false });
    fs.writeFileSync(path.join(FIXTURES_DIR, 'cropbox-mediabox.pdf'), bytes);
    console.log(' - cropbox-mediabox.pdf generado');
  }

  // 9. Hoja E (>= 3600x2400 pt, decenas de miles de trazos)
  if (options.includeLarge) {
    console.log('Generando sheet-e-dense.pdf (hoja E densa)...');
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([3600, 2400]); // ANSI E / Arch E dimensiones
    page.drawText('PLANO HOJA E DENSIDAD ALTA (3600x2400 pt)', { x: 100, y: 2300, size: 36 });

    // 15,000 trazos vectoriales para simular plano denso de ingeniería
    const strokeCount = 15000;
    const ops = [];
    ops.push('0.5 w'); // line width 0.5
    ops.push('0.2 0.2 0.2 RG'); // dark stroke
    for (let i = 0; i < strokeCount; i++) {
      const x1 = (i * 17) % 3500 + 50;
      const y1 = (i * 23) % 2200 + 50;
      const x2 = x1 + ((i % 100) - 50) * 2;
      const y2 = y1 + (((i * 7) % 100) - 50) * 2;
      ops.push(`${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S`);
    }

    const contentStream = pdfDoc.context.flateStream(ops.join('\n'));
    const contentRef = pdfDoc.context.register(contentStream);
    const existingContents = page.node.get(PDFName.of('Contents'));
    if (existingContents instanceof PDFArray) {
      existingContents.push(contentRef);
    } else if (existingContents) {
      page.node.set(PDFName.of('Contents'), pdfDoc.context.obj([existingContents, contentRef]));
    } else {
      page.node.set(PDFName.of('Contents'), contentRef);
    }

    const bytes = await pdfDoc.save({ useObjectStreams: false });
    fs.writeFileSync(path.join(FIXTURES_DIR, 'sheet-e-dense.pdf'), bytes);
    console.log(` - sheet-e-dense.pdf generado (${(bytes.length / (1024*1024)).toFixed(2)} MB, ${strokeCount} trazos)`);
  }

  // 10. 300 páginas
  if (options.includeLarge) {
    console.log('Generando pages-300.pdf (300 paginas)...');
    const pdfDoc = await PDFDocument.create();
    for (let i = 1; i <= 300; i++) {
      const page = pdfDoc.addPage([595, 842]); // A4
      page.drawText(`Pagina de Proyecto #${i} de 300`, { x: 50, y: 800, size: 14 });
      page.drawText(`Especificacion tecnica seccion ${Math.floor(i / 10) + 1}.${i % 10}`, { x: 50, y: 770, size: 11 });
    }
    const bytes = await pdfDoc.save({ useObjectStreams: true });
    fs.writeFileSync(path.join(FIXTURES_DIR, 'pages-300.pdf'), bytes);
    console.log(` - pages-300.pdf generado (${(bytes.length / 1024).toFixed(1)} KB, 300 paginas)`);
  }

  // 11. ~100 MB con imágenes
  if (options.includeLarge) {
    console.log('Generando large-100mb.pdf (~100 MB con imagenes)...');
    const pdfDoc = await PDFDocument.create();
    // Creamos imagenes raster sinteticas crudas (XObject /Subtype /Image)
    // Para no tardar minutos codificando PNGs, inyectamos streams DCT o Flate crudos
    // Generamos varias páginas con imagenes de ~10 MB cada una
    const page = pdfDoc.addPage([1200, 800]);
    page.drawText('PLANO ESCANEADO DE ALTA RESOLUCION (~100 MB)', { x: 50, y: 750, size: 20 });

    // Creamos 10 objetos Image de ~10 MB cada uno = ~100 MB
    const imgSize = 10 * 1024 * 1024;
    const dummyRgb = Buffer.alloc(imgSize, 0x88); // buffer de 10 MB relleno
    for (let p = 0; p < 10; p++) {
      // Usamos stream sin comprimir para generar exactamente ~10MB por stream en disco
      const imgStream = pdfDoc.context.stream(dummyRgb, {
        Type: 'XObject',
        Subtype: 'Image',
        Width: 2048,
        Height: 1706,
        ColorSpace: 'DeviceRGB',
        BitsPerComponent: 8,
      });
      pdfDoc.context.register(imgStream);
    }
    const bytes = await pdfDoc.save({ useObjectStreams: false });
    fs.writeFileSync(path.join(FIXTURES_DIR, 'large-100mb.pdf'), bytes);
    console.log(` - large-100mb.pdf generado (${(bytes.length / (1024*1024)).toFixed(2)} MB)`);
  }

  console.log('[FIXTURES] Todos los fixtures generados exitosamente.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('./spikes/motor/scripts/make-synthetic-fixtures.mjs')) {
  generateAllFixtures().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
