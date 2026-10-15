# ADR-0048: Shift a 45° y cajas cuadradas, y cursores visibles sobre la hoja

- **Estado:** Aceptado (usuario, 2026-10-15: "sí, agrégalo, además el cursor al ser blanco se pierde con el fondo del
  pdf de muestra")
- **Fecha:** 2026-10-15
- **Amplía:** ADR-0047

## 1. Decisión

1. **Shift a 45°**: el segmento desde el punto anterior se ajusta a la dirección múltiplo de 45° más cercana
   (horizontal, vertical o diagonal), proyectando el cursor sobre ella, como en Revu. Se mide en unidades de página.
2. **Cajas cuadradas**: con Shift, el arrastre de rectángulo, elipse y nube rectangular forma un cuadrado o un
   círculo; el lado mayor manda y se conserva el sentido del arrastre.
3. **Cursores del plano**: los del sistema (cruz y flecha blancas) se perdían sobre la hoja blanca. Ahora el plano
   usa cursores SVG propios, oscuros con halo blanco, que se ven sobre la hoja y sobre las líneas negras del dibujo:
   - una cruz de precisión con el centro libre para dibujar;
   - una flecha oscura para seleccionar;
   - la mano de arrastre con Pan, que antes mostraba la cruz.

## 2. Evidencia

`src/components/OrthoShift.test.tsx`.
