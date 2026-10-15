# ADR-0047: Trazo recto con Shift

- **Estado:** Aceptado (usuario, 2026-10-15: "cuando hago algún trazo, al dejar presionado shift el trazo se bloquee
  en un ángulo recto para que la línea sea recta y no diagonal")
- **Fecha:** 2026-10-15

## 1. Decisión

1. Con Shift pulsado, el punto del cursor se lleva a la horizontal o a la vertical que pasa por el punto anterior del
   trazo, la más cercana al cursor (`orthoConstrain`). Las dos direcciones se comparan en unidades de página.
2. Se aplica después del snap (sigue enganchando dentro de ese eje), en la vista previa y al hacer clic o soltar.
3. Herramientas: Line, Arrow, Dimension, Polyline, Polygon, Cloud y Cloud+ libres, Length, Polylength, Area,
   Perimeter, Volume, Radius, Diameter y Calibrate. Rectángulo, elipse, mano alzada y el tercer clic de la
   distancia (desplazamiento) no cambian.
4. Al cerrar un contorno sobre su primer vértice no se endereza, para poder cerrarlo.
5. Shift sigue sumando a la selección con la herramienta Select.

## 2. Evidencia

`src/components/OrthoShift.test.tsx` y el E2E "Shift endereza el trazo: línea horizontal aunque el cursor se desvíe
(ADR-0047)".
