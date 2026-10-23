import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Tauri sirve cada archivo de la aplicación con el tipo MIME que adivina por su contenido, y un archivo con la marca de
 * cabecera de PDF en sus primeros 1024 bytes sale como `application/pdf`: el navegador rechaza cargarlo como módulo y
 * la ventana nativa se queda en blanco (ADR-0113). Un archivo de código fuente corto que tenga ese literal acaba así en
 * un fragmento pequeño del empaquetado, por eso no se permite en ningún archivo que no sea de pruebas.
 */
const MAGIC = '%PD' + 'F-';

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name) ? [full] : [];
  });
}

describe('El empaquetado no contiene la marca de cabecera de PDF como texto (ADR-0113)', () => {
  it('ningún archivo de src/ que no sea de pruebas la lleva escrita', () => {
    const offenders = sourceFiles(path.resolve(__dirname, '../..'))
      .filter((f) => fs.readFileSync(f, 'utf8').includes(MAGIC))
      .map((f) => path.relative(path.resolve(__dirname, '../..'), f));
    expect(offenders).toEqual([]);
  });
});
