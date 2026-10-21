# ADR-0092: Menú contextual dentro de la ventana y texto de callout estable al moverlo

- **Estado:** Aceptado
- **Fecha:** 2026-10-21

## 1. Contexto

La verificación E2E de los hitos ADR-0090 y ADR-0091 falló en dos pruebas que ya fallaban en el commit anterior
(`9d940cf`), es decir, regresiones previas que ninguna verificación completa había cubierto:

1. **Menú contextual de marcas:** desde el menú de Revu 21 (ADR-0081) es más alto que la cifra fija (560 px) con la que
   se calculaba su posición. En una ventana de 720 px las últimas entradas, entre ellas "Set Status", quedaban fuera de
   la ventana y no se podían alcanzar.
2. **Texto de la nota de Cloud+:** la caja del callout se mide justo al texto. Al arrastrar el grupo, el ancho de la
   caja cambia en el último decimal (suma de coordenadas normalizadas) y el texto "Cloud+ note" saltaba a dos líneas.

## 2. Decisión

1. `CanvasContextMenu` mide su altura real tras pintar y se coloca para que quede entero dentro de la ventana.
2. `wrapCalloutText` admite 0.05 pt de holgura al decidir si una línea cabe.

## 3. Pruebas

- `src/core/markup/wrapTolerance.test.ts` (nueva).
- E2E `menú Medición → área por polígono…`: abre antes el submenú "Set Status" (`canvas-menu-status`), porque desde
  ADR-0081 los estados están en un submenú y la prueba hacía clic en una entrada que no se ve hasta abrirlo.
- E2E de Cloud+ como grupo: sin cambios; vuelve a pasar con la holgura.

## 4. Estabilidad de la suite E2E

Dos fuentes de intermitencia, anteriores a estos hitos, hacían fallar la verificación aunque el código estuviera bien:

- **Primera carga fría de Vite:** la primera prueba de cada pasada fallaba por la espera de 5 s. Se añade
  `tests/e2e/globalSetup.ts`, que carga la aplicación una vez antes de empezar (`playwright.config.ts`).
- **Selección de la nube por el borde** en la prueba "Vista continua, cota, puntos de control y zoom": con la máquina
  cargada el clic llegaba antes de que la nube estuviera pintada. La selección se reintenta con `toPass`. Es un cambio
  de la prueba, no de lo que comprueba.
