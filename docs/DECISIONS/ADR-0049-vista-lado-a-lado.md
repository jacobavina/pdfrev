# ADR-0049: Vista lado a lado (Split View)

- **Estado:** Aceptado (pendiente de la lista de paridad con Revu: "vista lado a lado")
- **Fecha:** 2026-10-15

## 1. Contexto

Para revisar planos se comparan dos hojas: una revisión nueva con la anterior, o la planta con su detalle. Overlay
Pages (ADR-0038) las superpone; Revu además las pone una junto a otra (Split View) con desplazamiento sincronizado.

## 2. Decisión

1. **Document ▸ Side by Side**:
   - "Compare with Another PDF…": otra revisión, que muestra sus propias anotaciones.
   - "Compare with a Page of This Document": la página siguiente, con las marcas de REA de esa página.
2. El panel se abre a la derecha del visor (`SplitPane`) y comparte su zoom y su rotación.
   - Tiene navegación de páginas, Sync y Close.
   - Es de solo lectura: las marcas se editan en el visor principal.
3. **Sync**, encendido por defecto:
   - El visor publica el centro de su vista como un punto normalizado de su página activa (`viewCenterOnPage`).
   - El panel se desplaza para centrar ese mismo punto (`scrollToCenter`).
   - Con otro PDF, el panel también sigue la página del visor.
4. El panel se carga en un fragmento aparte (presupuesto del bundle).

## 3. Evidencia

`src/components/viewer/SplitPane.test.tsx` y el E2E "Vista lado a lado: otra página del documento al mismo zoom, con
navegación y Sync (ADR-0049)".
