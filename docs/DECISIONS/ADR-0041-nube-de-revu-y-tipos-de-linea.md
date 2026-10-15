# ADR-0041: Nube como la de Revu, tipos de línea con patrón y tamaño de nube

- **Estado:** Aceptado (capturas del usuario de Revu, 2026-10-15: "las formas de las nubes se ven muy raras, no
  parece nube [...] los puntos amarillos y recuadros azules deben estar más separados. Igual falta incorporar varios
  tipos de línea y trazos" y "falta la opción para cambiar el tamaño de las nubes")
- **Fecha:** 2026-10-15
- **Sustituye:** el festón de ADR-0021 (lóbulos de 200° sobre cada cuerda)

## 1. Contexto

La nube de REA dibujaba un arco de 200° sobre cada tramo del contorno. En las esquinas y en los lados cortos daba
festones planos que no parecían nube. En Revu cada lóbulo es un círculo centrado sobre el contorno, con uno en
cada vértice, y el arco entra un poco en el lóbulo siguiente.

En la caja de selección de REA los cuadros azules quedaban a 4 px de los puntos, encima de los vértices amarillos.
En Revu la caja rodea todo el dibujo con margen.

El menú de tipos de línea de Revu tiene Solid, Dashed 1 a 6, Cloud y patrones (Fenceline, Gas, Hot Water, Zig Zag,
Insulation, Double, Tracks, Road), además de un botón con el tamaño y la inversión de la nube. REA solo tenía cuatro
tipos de línea y el tamaño de nube en el panel lateral.

## 2. Decisión

1. **Nube de Revu** (`revisionCloud.ts`):
   - Hay un círculo centrado en cada vértice y a intervalos de no más de un paso a lo largo de cada lado. El radio
     es 0.62 veces el paso, así que los vecinos siempre se cortan.
   - Se dibuja la parte exterior de cada círculo, de corte a corte.
   - El arco sigue 22° dentro del lóbulo siguiente y vuelve por el mismo camino. Así se forma el gancho sin
     cambiar el relleno.
   - La misma función dibuja la pantalla, el `/AP` y el aplanado.
2. **Tipos de línea con patrón** (`linePatterns.ts`), en líneas, polilíneas, polígonos, rectángulos y elipses:
   - Tipos: nube, valla de círculo o de cuadro, gas, agua caliente, zigzag, aislamiento, doble, vías y camino.
   - Las medidas van en pt y crecen con el grosor.
   - El texto de GAS y HW se dibuja con letras de trazo (sin fuentes) y siempre se lee de izquierda a derecha.
   - Las flechas de las líneas se conservan.
   - Se guarda en `style.lineStyle` y en el diccionario REA del PDF. El `/AP` lleva el dibujo, así que Revu y
     Acrobat lo muestran igual.
3. **Dashed 1 a 6** (más Dotted) como patrones `/D` estándar. Al leer un PDF se reconocen por sus proporciones.
4. **Barra de propiedades**:
   - El menú de tipos de línea muestra marca, nombre y dibujo de cada opción, con los patrones separados, como en
     Revu.
   - Con selección, el cambio es un solo paso deshacible (`applyLineStyle`). Cloud convierte rectángulos y
     polígonos en nubes; cualquier otro tipo quita la nube.
   - El botón de nube (Size e Invert) edita la nube seleccionada o el tamaño de las nubes nuevas. Solo está
     activo con el tipo de línea Cloud.
5. **Caja de selección separada del dibujo**: rodea los lóbulos o el ancho del patrón más 8 px. Los cuadros de
   escalar se arrastran con el mismo desfase, así la marca no salta al empezar.

## 3. Consecuencias

- Las nubes ya guardadas cambian de dibujo; su contorno, tamaño e inversión se conservan.
- Se actualizaron las pruebas que fijaban el punto inicial y el número de curvas del festón anterior, y el arrastre
  del tirador de escala (ahora está separado de la marca).

## 4. Evidencia

`src/core/markup/linePatterns.test.ts`, `src/components/RevuLineStyles.test.tsx` y el E2E "Nube de Revu, tipos de
línea con patrón y tamaño de nube en la barra (ADR-0041)".
