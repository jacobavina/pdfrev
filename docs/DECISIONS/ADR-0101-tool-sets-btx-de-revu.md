# ADR-0101: Importar y exportar Tool Sets de Revu (.btx)

- **Estado:** Aceptado
- **Fecha:** 2026-10-21
- **Hito:** Fase E, Hito E.2

## 1. Contexto

Las constructoras tienen paletas de herramientas de Revu (Tool Sets) que quieren llevar a REA, y a la inversa. El
formato `.btx` no está documentado. Se dedujo de los 12 Tool Sets que Revu 21 tiene instalados en el equipo del
usuario (`%APPDATA%\Bluebeam Software\Revu\21`), que se leyeron en local; **ninguno se copió al repositorio** (son
contenido de Bluebeam). Las pruebas usan Tool Sets escritos a mano con la misma estructura.

## 2. El formato

> [!NOTE]
> El formato `.btx` no utiliza cifrado criptográfico ni mecanismos de protección DRM; los campos de datos consisten en diccionarios estándar de anotaciones PDF empaquetados mediante compresión `zlib` (Deflate RFC 1951) y codificados en cadenas hexadecimales para su interoperabilidad.

- XML UTF-8 con BOM y CRLF, raíz `<BluebeamRevuToolSet Version="1">`.
- `<Title>`: el nombre del Tool Set, comprimido con zlib y escrito en hexadecimal.
- Por herramienta, `<ToolChestItem Version="1">` con:
  - `Name`: 16 letras mayúsculas al azar;
  - `Type`: `Bluebeam.PDF.Annotations.AnnotationLine`, `…Polygon`, `…Square`, `…FreeText`, `…Ink`, `…MeasureArea`,
    `…MeasureCount` y similares;
  - `Raw`: el diccionario de la anotación PDF (con `/Subj`, `/C`, `/BS`, `/IT`, `/Measure`…), comprimido con zlib y en
    hexadecimal, con el rectángulo en el origen;
  - `X`, `Y`: el desplazamiento del dibujo dentro del rectángulo;
  - `Index` y `Mode` (`properties` o `drawing`).
- Algunas herramientas llevan además `Resources` y `Data` (sellos con arte propio) o `Sequence` (numeraciones).

## 3. Decisión

1. **`src/core/toolchest/btx.ts`** lee y escribe esa envoltura, con la compresión zlib nativa del navegador
   (`CompressionStream`), sin dependencias nuevas.
2. **Importar (`btxConvert.ts` y `btxRefine.ts`):** las anotaciones de todas las herramientas se vuelcan en un PDF
   temporal y se leen con el lector de anotaciones de REA, el mismo que abre los PDF de Revu y Acrobat. Después se afina
   lo que Revu distingue con `/IT` y no el subtipo PDF: nube (`PolygonCloud`), distancia (`LineDimension` con
   `/MeasurementTypes`), longitud de recorrido (`Polylength`), radio, lápiz, resaltador (`/BM /Multiply`) y símbolo y
   escala del conteo. Con los 12 Tool Sets del usuario, 78 de 79 herramientas se importan; la restante es un sello.
3. **Exportar (`btxExport.ts`):** cada herramienta se escribe como anotación con el escritor de PDF de REA, se coloca
   en el origen con un margen de 6 pt, se quita lo que Revu no guarda (página, apariencia, autor, fechas, datos
   privados de REA) y el nombre de la herramienta pasa a `/Subj`.
4. **Interfaz:** en el Tool Chest, los botones Importar y Exportar junto a la paleta. Importar crea una paleta con el
   título del Tool Set (si ya existe, "Título (2)") y cada herramienta con su modo. Exportar escribe un `.btx` de la
   paleta activa.
5. **Rust:** `save_export_file` admite la extensión `.btx` (nueva prueba cargo).

## 4. Alcance y límites

- **No se importan** los sellos con arte propio (`AnnotationBRXStamp`); se avisa de cuántos se omitieron y por qué.
- **Herramientas compuestas:** algunos símbolos de Revu llevan varias anotaciones (`<Child>`: un cuadro con líneas, por
  ejemplo; hay 27 en los 12 Tool Sets). REA solo importa la anotación principal.
- Las numeraciones (`Sequence`) y los datos de columnas de Revu (`BSIColumnData`, `TempGroupNesting`) se ignoran.
- **Sin comprobar contra Revu:** no hay Revu en las pruebas. La ida y vuelta se comprueba dentro de REA y contra la
  estructura de los Tool Sets reales (claves, nombres, orden). Que Revu abra un `.btx` exportado por REA lo tiene que
  confirmar el usuario con un Tool Set y, si falla, con el mensaje de Revu para corregir la clave que no acepte.
- La herramienta de dibujo de REA guarda estilo y forma; hatch, tipos de línea con patrón y otros campos propios de REA
  no tienen equivalente en Revu y no se exportan.

## 5. Pruebas

- `src/core/toolchest/btx.test.ts` (4): zlib, lectura y escritura de la envoltura, importación y ida y vuelta REA →
  Revu → REA.
- Rust `test_save_export_file_atomic_success_btx`.
- E2E `Tool Sets de Revu (ADR-0101)`: importar un `.btx` desde el panel, ver la paleta y sus herramientas, exportarla y
  releer el archivo.
