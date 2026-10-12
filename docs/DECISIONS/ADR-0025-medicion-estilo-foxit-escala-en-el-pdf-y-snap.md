# ADR-0025: Panel de medición estilo Foxit, escala guardada en el PDF y snap

- **Estado:** Aceptado (pedido del usuario, 2026-10-11, con captura de Foxit Format › Measure)
- **Fecha:** 2026-10-11

## 1. Contexto

La escala se definía solo con dos puntos o un factor por punto, sin presets ni pies-pulgadas, y **no se guardaba**:
al reabrir el PDF se perdía (y podía quedar la de otro documento). Revu y Acrobat guardan la escala en la página
(/VP /Measure) y la leen al abrir.

## 2. Decisión

1. **Panel Measure** con las secciones de Foxit: Scale (Calibrate, Add Preset, Preset/Custom, relación
   "papel = real" con unidades mm/cm/in/pt = mm/cm/m/in/ft/ft'in, Separate Y Scale, Precision decimal o fraccionaria,
   aplicar a todas las páginas), Distance Properties (Label, unidad de longitud), Snap, Settings (Show Result
   Information), Totals y Export.
2. **Escalas** (`core/measurements/scale.ts`): presets métricos (1:1 … 1:1000), arquitectónicos (1/16" … 3" = 1'-0")
   e ingenieriles (1" = 10' … 100'); presets propios en `localStorage`; pies-pulgadas `12'-6 1/2"` con fracciones;
   escala Y separada en longitudes, polilongitudes y áreas.
3. **Escala en el PDF** (`core/pdf/pdfScale.ts`): /VP con /Measure /RL (/R, /X con /C y /U, /Y, /D, /A) más /REACal con la
   calibración completa. Al abrir se leen las escalas de REA, Revu o Acrobat; al guardar solo se reescriben las páginas
   cuya escala cambió (se respetan los viewports de Revu). Las escalas ya no se arrastran entre documentos.
4. **Snap** (`core/markup/snap.ts`): extremos, puntos medios y punto más cercano de las marcas existentes, con
   tolerancia de 8 px y prioridad extremo > medio > más cercano; indicador sobre el plano; preferencias recordadas.
5. **Label**: las mediciones nuevas guardan su etiqueta (`customFields.measureLabel`) y se muestran como "Wall: 10.6 m".

## 3. Pendiente

Reglas (Rulers), snap al contenido vectorial del PDF y varios viewports por página.

## 4. Evidencia

`scale.test.ts`, `pdfScale.test.ts`, `snap.test.ts`, `PdfViewerDimension.test.tsx` y el E2E de ADR-0024/0025/0026.
