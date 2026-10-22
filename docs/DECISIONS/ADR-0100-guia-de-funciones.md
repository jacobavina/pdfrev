# ADR-0100: Guía de funciones en Help

- **Estado:** Aceptado
- **Fecha:** 2026-10-21

## 1. Contexto

Había un diálogo de atajos (F1), pero ningún sitio que explicara qué hace cada función, dónde está y cómo se usa. Con
las funciones de Revu que se han ido añadiendo (Compare, Dynamic Fill, perfiles, texto separable de la flecha…) el
usuario no tenía cómo descubrirlas.

## 2. Decisión

1. **`Help ▸ Feature Guide`:** diálogo con las secciones a la izquierda, un buscador arriba y, por función, qué hace,
   dónde está (menú, pestaña o panel), el atajo y los pasos.
2. **Contenido en `src/core/help/featureGuide.ts`:** 7 secciones (primeros pasos, ver el plano, herramientas de
   marcado, editar marcas, medir y metrados, páginas y documentos, lista de marcas e informes) y más de 40 funciones.
   Texto de interfaz, en inglés.
3. **El buscador** cruza todas las secciones: título, resumen, pasos, atajo, menú y sección; admite varias palabras.
4. **La guía no se queda atrás:** una prueba exige que toda herramienta de la cinta con atajo aparezca en la guía. Al
   añadir una herramienta nueva con atajo, la prueba falla hasta que se documente.

## 3. Alcance y límites

- Es texto escrito a mano, no se genera del código: una función sin atajo no tiene la protección de la prueba.
- No hay imágenes ni vídeo.

## 4. Pruebas

- `src/core/help/featureGuide.test.ts` (3): estructura, cobertura de las herramientas con atajo y búsqueda.
- `src/components/shell/FeatureGuideDialog.test.tsx` (1): secciones, búsqueda y Escape.
- E2E `Guía de funciones (ADR-0100)`: el menú Help la abre, busca y cierra.
