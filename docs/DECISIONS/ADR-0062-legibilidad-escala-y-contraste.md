# ADR-0062: Legibilidad de la interfaz: escala tipográfica única, contraste AA y waiver de la capa de texto de PDF.js

- **Estado:** Aceptado
- **Fecha:** 2026-10-16
- **Amplía:** ADR-0044 (sistema visual "sala de planos")

## 1. Contexto

La auditoría de diseño con `impeccable` (4.6.0) sobre la app servida en `http://localhost:1421` dio 70 hallazgos:
- 41 `undersized-ui-text`;
- 8 `low-contrast`;
- 3 `tiny-text`;
- 17 `text-occlusion`;
- 1 aviso `shape-assembled-illustration`.

El escaneo terminó con exit 2. El escaneo de `src/` ya terminaba con exit 0.

## 2. Decisión

1. **Una escala tipográfica:**
   - 11 / 12 / 13 / 14 / 16 px, como variables `--fs-2xs … --fs-lg` en `src/index.css`. Tailwind solo ofrece esos
     cinco tamaños (`text-2xs`, `text-xs`, `text-sm`, `text-base`, `text-lg`).
   - Todos los `text-[Npx]` y `font-size` sueltos pasaron a la escala:
     - lo que estaba por debajo de 11 px sube a 11;
     - 11.5 sube a 12 y 12.5 a 13;
     - el antiguo `text-sm` (14 px) es ahora `text-base`, y el antiguo `text-base` (16 px) es `text-lg`.
   - Suben a 11 px:
     - las etiquetas de herramientas de la cinta (antes 10.5);
     - los rótulos de grupo y de la barra de propiedades (antes 9.5);
     - la opacidad "100%" y la insignia "1 markup";
     - los números de las reglas (antes 9).
   - Las flechas ▲▼ de 8 px del tamaño de nube pasan a ser iconos.
   - No entra ninguna fuente nueva: sigue Segoe UI Variable del sistema, sin cambios en ATTRIBUTION.md.
2. **Contraste AA.** Los valores se calcularon con un verificador, no a ojo. Pasan 4.5:1 sobre todos los fondos del
   cromo en ambos temas:
   - `gray-500`, texto atenuado: oscuro #6c7583 → #979ea8; claro #707a88 → #606874. `gray-400` oscuro → #adb4be, para
     conservar la jerarquía.
   - `--cad-accent`, acento como texto, borde o icono: oscuro #4a98f5 → #8abdf9; claro #1d6cd0 → #1755a4. Pasa también
     sobre su propio fondo tenue (14–20 %).
   - `--cad-accent-fill` (nuevo), acento sólido bajo texto blanco: oscuro #3976be, claro #1d6cd0.
     - Lo usan el botón primario, el logo, los menús resaltados y las opciones activas de Search y Tool Chest.
     - Los azules sueltos de Tailwind que hacían ese papel también pasan a este token: sigue habiendo un solo color de
       acento.
   - Hover del botón de borrar: rose-500 → rose-700, porque el blanco sobre rose-500 no llegaba a 4.5:1.
3. **Oclusión (17), texto diminuto (3) y los 11 textos de 8 px restantes: falso positivo.**
   - Todos son spans de `div.textLayer`, la capa de selección de PDF.js. Es una copia transparente
     (`color: rgba(0,0,0,0)`) del texto del propio plano: título, "Dimensiones de página", las cotas 50…650 y los rótulos
     del rectángulo de control.
   - Su tamaño lo dicta el PDF y queda bajo la capa SVG de marcas por diseño. La necesita Text Highlight (A.6).
   - No se cambia. Se registra como waiver con su motivo en `.impeccable/config.json`.
   - El detector no extrae valor para estas tres reglas, así que el waiver solo puede cubrir la URL entera. Para que no
     oculte un texto de interfaz real, `src/designScale.test.ts` comprueba en el código fuente:
     - que la escala es exactamente 11/12/13/14/16;
     - que no hay `text-[Npx]`;
     - que el texto SVG de la interfaz no baja de 11 px;
     - que los tokens de ambos temas pasan 4.5:1.
4. **Aviso no contable `shape-assembled-illustration`:** es la capa SVG de marcas sobre la hoja (800×600). Se deja como
   está.
5. **Invariante del panel colapsado de 32 px (A.6):** dejó de existir con ADR-0060, cuando la lista de marcas pasó a
   ocultarse entera como en Revu, a petición del usuario. Ese cambio y el de su prueba E2E se justificaron en aquel
   commit. Este rediseño no toca pruebas.

## 3. Verificación

- `src/designScale.test.ts`:
  - `la interfaz usa una sola escala tipográfica de 11/12/13/14/16 px, sin tamaños sueltos ni texto bajo 11 px`
  - `el texto atenuado y el acento pasan 4.5:1 sobre todos los fondos del cromo, y el blanco sobre el acento sólido`
- `npx.cmd impeccable detect http://localhost:1421`:
  - antes: exit 2 con 69 hallazgos y 1 aviso;
  - después: exit 0, "0 anti-patterns found", 1 aviso no contable.
- `npx.cmd impeccable detect src/`: exit 0 antes y después.
- Revisado en la vista previa del navegador, en tema oscuro y claro, con reglas y lista abiertas: la cinta cabe sin
  desbordarse.
