import fs from 'fs';

/**
 * Escritor de Actualización Incremental de PDF (ISO 32000-1 §7.5.6)
 * Preserva el 100% de los bytes originales como prefijo inmutable.
 */
export class IncrementalWriter {
  constructor(originalBytes) {
    this.originalBytes = Buffer.from(originalBytes);
    this.newObjects = []; // { objNum, gen, content: Buffer }
    this.parseOriginalTrailer();
  }

  parseOriginalTrailer() {
    const raw = this.originalBytes.toString('latin1');
    const startXrefIdx = raw.lastIndexOf('startxref');
    if (startXrefIdx === -1) {
      throw new Error('Estructura de PDF inválida: no se encontró startxref');
    }

    const afterStartXref = raw.slice(startXrefIdx + 9).trim();
    const prevOffsetMatch = afterStartXref.match(/^(\d+)/);
    if (!prevOffsetMatch) {
      throw new Error('No se pudo leer el offset de startxref');
    }
    this.prevStartXref = parseInt(prevOffsetMatch[1], 10);

    // Buscar el diccionario trailer anterior (o trailer de xref stream)
    const trailerIdx = raw.lastIndexOf('trailer', startXrefIdx);
    if (trailerIdx !== -1) {
      const trailerChunk = raw.slice(trailerIdx, startXrefIdx);
      const sizeMatch = trailerChunk.match(/\/Size\s+(\d+)/);
      this.prevSize = sizeMatch ? parseInt(sizeMatch[1], 10) : 10;

      const rootMatch = trailerChunk.match(/\/Root\s+(\d+\s+\d+\s+R)/);
      this.rootRef = rootMatch ? rootMatch[1] : null;

      const infoMatch = trailerChunk.match(/\/Info\s+(\d+\s+\d+\s+R)/);
      this.infoRef = infoMatch ? infoMatch[1] : null;
    } else {
      // PDF con XRef stream (PDF 1.5+)
      // Fallback razonable: buscar /Root y /Size en los últimos 4KB
      const tail = raw.slice(Math.max(0, this.originalBytes.length - 4096));
      const sizeMatch = tail.match(/\/Size\s+(\d+)/);
      this.prevSize = sizeMatch ? parseInt(sizeMatch[1], 10) : 20;
      const rootMatch = tail.match(/\/Root\s+(\d+\s+\d+\s+R)/);
      this.rootRef = rootMatch ? rootMatch[1] : '1 0 R';
      this.infoRef = null;
    }

    this.nextObjNum = this.prevSize;
  }

  allocateObjectNumber() {
    const num = this.nextObjNum;
    this.nextObjNum++;
    return num;
  }

  addObject(objNum, bodyStringOrBuffer) {
    const bodyBuf = Buffer.isBuffer(bodyStringOrBuffer)
      ? bodyStringOrBuffer
      : Buffer.from(bodyStringOrBuffer, 'utf8');

    const header = Buffer.from(`${objNum} 0 obj\n`, 'utf8');
    const footer = Buffer.from(`\nendobj\n`, 'utf8');
    const fullObj = Buffer.concat([header, bodyBuf, footer]);

    this.newObjects.push({
      objNum,
      gen: 0,
      content: fullObj
    });
  }

  build() {
    const chunks = [this.originalBytes];
    if (this.originalBytes[this.originalBytes.length - 1] !== 10) {
      chunks.push(Buffer.from('\n', 'utf8'));
    }

    let currentOffset = this.originalBytes.length + (this.originalBytes[this.originalBytes.length - 1] !== 10 ? 1 : 0);
    const xrefEntries = [];

    // Escribir objetos nuevos
    for (const obj of this.newObjects) {
      xrefEntries.push({
        objNum: obj.objNum,
        gen: obj.gen,
        offset: currentOffset
      });
      chunks.push(obj.content);
      currentOffset += obj.content.length;
    }

    // Ordenar entradas por número de objeto
    xrefEntries.sort((a, b) => a.objNum - b.objNum);

    // Escribir sección xref
    const startXrefOffset = currentOffset;
    let xrefStr = 'xref\n';

    // Agrupar en subsecciones continuas
    let i = 0;
    while (i < xrefEntries.length) {
      let j = i;
      while (j + 1 < xrefEntries.length && xrefEntries[j + 1].objNum === xrefEntries[j].objNum + 1) {
        j++;
      }
      const count = j - i + 1;
      xrefStr += `${xrefEntries[i].objNum} ${count}\n`;
      for (let k = i; k <= j; k++) {
        const offsetStr = String(xrefEntries[k].offset).padStart(10, '0');
        const genStr = String(xrefEntries[k].gen).padStart(5, '0');
        xrefStr += `${offsetStr} ${genStr} n \n`;
      }
      i = j + 1;
    }

    chunks.push(Buffer.from(xrefStr, 'utf8'));
    currentOffset += Buffer.byteLength(xrefStr, 'utf8');

    // Escribir trailer
    const newSize = Math.max(this.nextObjNum, (xrefEntries[xrefEntries.length - 1]?.objNum ?? 0) + 1);
    let trailerStr = `trailer\n<<\n  /Size ${newSize}\n`;
    if (this.rootRef) trailerStr += `  /Root ${this.rootRef}\n`;
    if (this.infoRef) trailerStr += `  /Info ${this.infoRef}\n`;
    trailerStr += `  /Prev ${this.prevStartXref}\n>>\nstartxref\n${startXrefOffset}\n%%EOF\n`;

    chunks.push(Buffer.from(trailerStr, 'utf8'));

    const finalBuffer = Buffer.concat(chunks);

    // Comprobación de invariante crítica: los bytes originales deben ser prefijo exacto
    const isPrefixExact = finalBuffer.subarray(0, this.originalBytes.length).equals(this.originalBytes);
    if (!isPrefixExact) {
      throw new Error('[IncrementalWriter] Violación de invariante: los bytes originales no se conservaron intactos');
    }

    return finalBuffer;
  }
}
