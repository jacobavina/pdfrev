# ADR-0039: Nube de forma libre y tiradores de Revu

- **Estado:** Aceptado (capturas del usuario de Revu, 2026-10-15: "cuando hago una nube en revu la puedo hacer con
  cualquier forma inicialmente, además se ven más estéticos los puntos para cambiar la forma, tanto los amarillos
  como los azules, en la nuestra se ven enormes y poco estéticos")
- **Fecha:** 2026-10-15

## 1. Contexto

En REA la nube y la Cloud+ solo se dibujaban como rectángulo y había que deformarlas después. Los tiradores de
vértice medían 9 px con un contorno azul grueso. Tampoco había, como en Revu, cuadros azules en las esquinas para
escalar ni un tirador para rotar.

## 2. Decisión

1. **Nube y Cloud+ de forma libre**:
   - Un clic sin arrastrar empieza un contorno y cada clic añade un vértice.
   - Se cierra con Enter, doble clic o clic en el primer vértice.
   - Arrastrar sigue creando la nube rectangular.
   - En Cloud+, la llamada se coloca a la derecha y su flecha apunta al vértice más cercano a la esquina superior
     derecha. Su creación es común a la nube rectangular y a la libre.
2. **Tiradores como los de Revu**:
   - Vértices: círculos amarillos de 3.5 px con borde gris fino.
   - Caja de selección discontinua fina (1 px).
   - Esquinas: **cuadros azules de 7 px para escalar**, fijando la esquina opuesta (Mayús mantiene la proporción).
   - **Círculo azul sobre la caja para rotar** alrededor del centro, con pasos de 15° con Mayús. Gira en pt de
     página para no deformar y gira también las directrices.
   - Solo se rotan las marcas definidas por vértices. Nube y área rectangulares pasan a polígono al girarlas. Los
     tipos de caja (rectángulo, elipse, textos, sellos) solo se escalan.
3. La llamada no muestra cuadros de escalar: la punta de su flecha cae en una esquina de la caja y ya tiene sus
   propios tiradores (punta y "+"). Lo detectó el E2E A.3.
4. Escalar y rotar recalculan la medida de las mediciones y son un solo paso deshacible. Esc cancela.

## 3. Evidencia

`src/components/RevuEditing.test.tsx` y el E2E "Nube de forma libre, tiradores de Revu y fuente en la barra de
propiedades (ADR-0039/0040)".
