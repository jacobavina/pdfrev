# ADR-0090: Renderizado por región visible a zoom máximo

- **Estado:** Aceptado
- **Fecha:** 2026-10-21
- **Hito:** Fase D (Rendimiento en Planos Grandes, Hito D.3)
- **Decisión anterior:** ADR-0089 (índice espacial y virtualización).

## 1. Contexto

ADR-0088 midió que una hoja E-size (3600 × 2400 pt) supera el límite de canvas de Chromium/WebView2 (16 384 px por
lado, unos 268 Mpx de área) a partir de ~455 % de zoom con dpr 1 y ~227 % con dpr 2. REA permite hasta 500 %. Por
encima del límite el canvas queda en blanco.

## 2. Decisión

1. **Plan puro (`src/core/render/tilePlan.ts`):**
   - decide si la hoja cabe en un solo canvas (16 384 px por lado y 100 Mpx de área, con margen sobre el límite real);
   - si no cabe, calcula la región visible más 512 px de sobreexploración, alineada a 64 px y acotada a 4096 px CSS
     (y a los límites del canvas con el dpr).
2. **`renderPageToCanvas`:**
   - acepta `region`;
   - rasteriza solo esa región en un canvas del tamaño de la región, colocado en su posición dentro de la hoja
     (`position: absolute`);
   - la capa de texto y los tamaños devueltos siguen siendo los de la hoja entera.
   - Sin región, si el búfer no cabe, baja la resolución en lugar de dejar el lienzo en blanco (visores secundarios).
3. **`PageCanvas`:**
   - recalcula la región con el zoom, el giro, el scroll del visor y el redimensionado;
   - renderiza de nuevo solo cuando lo visible sale de la región ya rasterizada;
   - las hojas que caben se renderizan enteras, como antes.
4. **Instantánea (ADR-0085):** `captureCanvasSlice` pasa el rectángulo normalizado de la hoja a coordenadas del canvas
   cuando este es una región (`data-region="true"`).

## 3. Alcance y límites

- No es un mosaico de teselas fijas: es una única región que sigue al scroll. Cubre el objetivo (sin pantallas en
  blanco a zoom máximo) con menos memoria y sin gestionar una caché de teselas.
- Mientras se desplaza fuera de la región se ve el último raster hasta que termina el render siguiente.
- El fixture de pruebas no tiene tamaño E-size, así que el camino por región se verifica con pruebas unitarias de
  componente y no con E2E.

## 4. Pruebas

- `src/core/render/tilePlan.test.ts` (5): límites, bordes, cobertura y desplazamiento.
- `src/components/viewer/TiledHighZoom.test.tsx` (2): E-size a 600 % pide una región dentro de los límites que cubre lo
  visible; una hoja que cabe se renderiza entera.
