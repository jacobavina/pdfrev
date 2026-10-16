# ADR-0055: Importación y relleno de formularios AcroForm de PDFs hechos en otras aplicaciones

- **Estado**: Aceptado
- **Fecha**: 2026-10-15
- **Relacionado con**: ADR-0027 (`formField`, `link`, `fileAttachment`), `src/core/pdf/annotationReader.ts`, `src/core/pdf/incrementalWriter.ts`, `src/components/markup/InteractiveProperties.tsx`

## Contexto

Con `ADR-0027`, REA creaba campos `AcroForm` propios (`/Subtype /Widget` con diccionario `/REA`) y recuperaba los cambios hechos sobre esos mismos campos fuera de la aplicación. Sin embargo, al abrir un PDF creado en otra aplicación (Bluebeam Revu, Adobe Acrobat, LibreOffice, AutoCAD, `pdf-lib`, etc.), sus widgets `/Subtype /Widget` carecen de `/REA`:
1. En `annotationReader.ts`, `/Subtype /Widget` no estaba incluido en `SUPPORTED_STANDARD_SUBTYPES`, por lo que los campos de formulario ajenos se contabilizaban como anotaciones no soportadas (`foreignUnsupportedCount`) y no podían rellenarse en REA.
2. En los formularios estándar (ISO 32000-1 §12.7.3.1), los atributos de campo (`/FT`, `/T`, `/Ff`, `/V`, `/Opt`) pueden residir en el propio diccionario del widget (diccionario fusionado) o heredarse de un diccionario padre `/Parent` (como ocurre en grupos de botones de opción y en formularios con campos separados de sus widgets).
3. Al guardar incrementalmente un formulario ajeno rellenado, es imprescindible reutilizar el número de objeto original del widget (`foreignWidgetObjNum`) y actualizar in-place el diccionario `/Parent` (`foreignParentObjNum`) sin duplicar referencias en `/AcroForm /Fields` ni dejar `/NeedAppearances true` contradiciendo el nuevo `/AP /N`.

## Decisión

1. **Importación de `/Subtype /Widget` ajenos (`importForeignWidget` en `annotationReader.ts`)**:
   - Se añade `'Widget'` a `SUPPORTED_STANDARD_SUBTYPES` mapeado a `formField`.
   - Para widgets sin `/REA`, se recorre la cadena `/Parent` (hasta 8 niveles con detección de ciclos) para resolver `/FT` (`Tx`, `Btn`, `Ch`, `Sig`), `/Ff` (distinguiendo `button` bit 17, `radio` bit 16, `checkbox`, `dropdown` bit 18 y `listbox`), el nombre jerárquico `/T`, el valor `/V` y las opciones `/Opt` (incluyendo la resolución de índices numéricos `/0`, `/1` en grupos de opción con `/Opt`).
   - Se inspeccionan las claves de `/AP /N` distintas de `/Off` para preservar el nombre exacto del estado activo (`onStateName`) y se respeta el bit 1 de `/Ff` (`ReadOnly` -> `locked = true`).
   - Se registran `foreignWidgetObjNum` y `foreignParentObjNum` en `customFields`.
2. **Escritura incremental in-place (`incrementalWriter.ts`)**:
   - Cuando el widget tiene `foreignWidgetObjNum`, se reutiliza ese mismo número de objeto en la revisión incremental.
   - Si el widget tiene `foreignParentObjNum`, el widget mantiene únicamente `/Parent <P> 0 R` (sin duplicar `/FT`, `/T` ni `/V` en el hijo) y el diccionario padre `<P>` se actualiza in-place con el nuevo `/V` en la revisión incremental.
   - En `updateAcroForm`, se desduplican las referencias de `/Fields` por número de objeto y se elimina `/NeedAppearances` para que todos los visores muestren el `/AP /N` generado.
3. **Exclusión mutua en el panel de propiedades (`InteractiveProperties.tsx`)**:
   - Al marcar un botón de opción (`radio`) desde la casilla `Selected` del inspector de propiedades, se desmarcan automáticamente los demás botones del mismo grupo en la página, igual que al hacer doble clic sobre el lienzo.

## Verificación

- `src/core/pdf/formsInterop.test.ts`: test `importa y rellena formularios AcroForm de PDFs hechos en otras aplicaciones sin /REA (ADR-0055)`.
