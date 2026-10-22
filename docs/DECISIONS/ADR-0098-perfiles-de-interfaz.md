# ADR-0098: Perfiles de interfaz

- **Estado:** Aceptado
- **Fecha:** 2026-10-21
- **Hito:** Fase F, Hito F.6 (perfiles)

## 1. Contexto

Revisar planos, hacer metrados y consultar en obra piden ventanas distintas: pestaña de la cinta, paneles, lista de
marcas, modo de página y reglas. Cambiar todo a mano cada vez es lento.

## 2. Decisión

1. **Perfiles de fábrica** (`src/core/ui/profiles.ts`):
   - **Review:** pestaña Markup, miniaturas, panel Properties, lista de marcas abierta y páginas continuas.
   - **Takeoff:** pestaña Measure, panel de mediciones, lista de marcas, una página y reglas.
   - **Field:** todo plegado, una página, sin reglas.
2. **Perfil Custom:** `View ▸ Profiles ▸ Save Current Layout as Custom` guarda la disposición actual (pestaña, panel
   izquierdo, panel derecho, lista de marcas, modo de página y reglas) y la activa.
3. **Menú** `View ▸ Profiles` con Review, Takeoff, Field y Custom (desactivado mientras no haya una guardada).
4. **Persistencia:** el perfil elegido y la disposición Custom se guardan en el almacenamiento local y se recuperan al
   arrancar. Sin perfil elegido la ventana arranca como siempre, así que las pruebas E2E no cambian.
5. Lo guardado se valida al leerlo: una disposición ilegible se descarta.

## 3. Alcance y límites

- Un perfil fija disposición, no herramientas ni el contenido de la cinta ni las columnas de la lista de marcas.
- Elegir un perfil cambia el modo de página y las reglas, que ya tenían su preferencia propia.

## 4. Pruebas

- `src/core/ui/profiles.test.ts` (3): disposición por perfil, Custom guardado y recuperado, validación.
- E2E `Perfiles de interfaz (ADR-0098)`: el menú cambia la disposición y se recuerda al recargar.
