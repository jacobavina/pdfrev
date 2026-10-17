# ADR-0068: Pase final estético: mantel neutro, sin sombras decorativas, marca discreta y una sola convención de mayúsculas

- **Estado:** Aceptado
- **Fecha:** 2026-10-16
- **Amplía:** ADR-0062 (legibilidad), ADR-0064 (estructura y densidad) y ADR-0065 (sistema visual)

## 1. Contexto

Cuatro observaciones finales del usuario sobre la interfaz ya estructurada:

1. En tema claro el mantel (`--cad-canvas: 166 175 188`) era un gris **azulado y saturado**: el campo de color más
   grande de la aplicación y competía con el azul cianotipo del acento.
2. Las miniaturas de página "flotaban" con la sombra de la hoja (`sheet-shadow`), violando la regla de elevación del
   sistema (ADR-0065: la sombra es solo para superficies flotantes).
3. El distintivo "R REA" era una pastilla rellena de acento (`bg-cad-accent-fill`): en tema oscuro, el píxel más
   saturado de la ventana.
4. La cinta mezclaba dos convenciones de mayúsculas (herramientas en Mayúscula Inicial, grupos en MAYÚSCULAS) y
   grafías sueltas ("Cloud+" frente a "Cloud Plus").

## 2. Decisión

1. **Mantel claro neutro.** Se probaron dos candidatos sobre la app servida (1440 × 900, captura completa):
   - `185 188 191` (Δcanal 6): contraste hoja-mantel 1.91:1 y mantel-cromo 1.81:1 — separa poco.
   - `165 168 171` (Δcanal 6): contraste hoja-mantel 2.39:1 y mantel-cromo 2.27:1 — **elegido**. Separa mejor la hoja
     blanca de los paneles (mejora el 2.22:1 de ADR-0064), sigue siendo neutro (sin tinte) y no oscurece la pantalla.
   El mantel del tema oscuro no cambia (`13 15 19`). Sigue siendo un token: ningún color suelto.
2. **Miniaturas sin sombra.** La tarjeta de cada miniatura pasa a nivel 2 de elevación: borde de 1 px con
   `--cad-border` (y conserva el anillo de acento al seleccionar). La clase `sheet-shadow` queda solo para la hoja
   real del visor y de la vista lado a lado. Revisadas todas las utilidades `shadow-*` del código: las demás son
   `shadow-float` en superficies flotantes legítimas (menús, popovers, avisos, diálogos, editor en línea y barras
   sobre el lienzo) o sombras interiores de indicadores (subrayado de pestaña, cabecera fija de la lista).
3. **Marca sin pastilla.** La R pasa a texto en `--cad-accent` (negrita) junto a "REA" en `--cad-strong` con
   tracking; desaparece la pastilla rellena. `--cad-accent-fill` queda solo para la selección resaltada.
4. **Una convención de mayúsculas.** Herramientas en Mayúscula Inicial escritas en los datos; grupos en MAYÚSCULAS
   por CSS con tracking de 0.08 em, altura fija de 12 px y una sola línea; pestañas en Mayúscula Inicial. Grafía
   canónica: **Cloud+** (la cinta, el menú Tools y la lista de tipos de marca), nunca "Cloud Plus" ni "CloudPlus".

## 3. Pruebas (todas deben poder fallar)

`src/designScale.test.ts` gana cuatro pruebas:

- `en tema claro el mantel es un gris neutro (diferencia máxima entre canales ≤ 10) y sigue más oscuro que los paneles (ADR-0068)`
- `las utilidades shadow-* solo viven en superficies flotantes con lista blanca: menús, popovers, avisos y diálogos (ADR-0068)`
- `la cinta usa una sola convención de mayúsculas: herramientas en Mayúscula Inicial y grupos en mayúsculas con tracking, en una sola línea, y una sola grafía para Cloud+ (ADR-0068)`
- `la marca "R REA" va sin pastilla rellena: la R en el acento y el resto en el color fuerte (ADR-0068)`

La lista blanca de flotantes está documentada en `docs/DESIGN.md` §6. Si alguien vuelve a poner `shadow-md` en una
tarjeta, la prueba se pone roja.

## 4. Verificación

- Capturas completas a 1440 × 900 en ambos temas con Playwright (ver `docs/STATUS.md`): mantel neutro píxel-exacto,
  miniaturas con borde y sin sombra, marca sin pastilla.
- `npx.cmd impeccable detect http://localhost:1421`: exit 0 antes y después.
- Puertas: `npm.cmd test` (794 pruebas), `node scripts/verify.mjs --with-e2e --e2e-loop 3` (35/35 ×3),
  `npm.cmd run test:native` en frío.