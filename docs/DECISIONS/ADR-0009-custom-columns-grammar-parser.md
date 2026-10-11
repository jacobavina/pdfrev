# ADR-0009: Columnas Personalizadas con Parser de Gramática Cerrada y Evaluación Segura (P2-C.3)

- **Estado:** Aceptado
- **Fecha:** 2026-10-11
- **Autores:** Equipo REA

---

## 1. Contexto

En flujos de trabajo de arquitectura, ingeniería y construcción (AEC), las anotaciones de revisión de planos no solo transmiten geometría gráfica sino también metadatos cuantitativos (dimensiones, mediciones estimadas, presupuestos, categorías de elementos y costes). 

Permitir a los usuarios definir columnas personalizadas y, en particular, columnas calculadas mediante expresiones matemáticas, introduce un riesgo crítico de seguridad si se implementa mediante intérpretes dinámicos estándar de JavaScript (`eval`, `new Function` o acceso arbitrario a propiedades de objetos), ya que expondría el motor a inyección de código (RCE), acceso indebido a APIs de Tauri/Node, y contaminación de prototipos (`__proto__`, `constructor`).

Asimismo, las expresiones calculadas pueden formar grafos de dependencias complejas, referencias circulares o divisiones por cero que podrían bloquear o congelar el hilo principal de la interfaz si no se gestionan mediante un núcleo puro acotado y determinista.

---

## 2. Alternativas Consideradas

1. **Intérprete general basado en `mathjs` o dependencias npm externas:** Descartado. Viola la directriz estricta de no añadir dependencias externas, incrementa el tamaño del bundle innecesariamente y complica la auditoría de seguridad.
2. **Evaluación dinámica con sandbox (`eval` / `Function` con proxy):** Descartado taxativamente. Los sandboxes en JavaScript son notoriamente vulnerables a escapes a través de prototipos o constructores de funciones globales.
3. **Núcleo puro con analizador léxico y sintáctico de gramática cerrada (Descenso Recursivo) sin dependencias:** Aceptado. Define un lenguaje formal estrictamente limitado a aritmética elemental y funciones matemáticas auditadas, con validación estricta de tipos, límites rígidos de ejecución y detección de ciclos en grafos de dependencias.

---

## 3. Decisión

Implementar un motor puro y formal de columnas personalizadas y calculadas estructurado en las siguientes capas:

### 3.1 Gramática Cerrada Formal
La sintaxis admitida se define formalmente en EBNF:
```text
expresión  := término (('+'|'-') término)*
término    := factor (('*'|'/') factor)*
factor     := ('+'|'-') factor | número | referencia | llamada | '(' expresión ')'
número     := dígitos ['.' dígitos]
referencia := identificador-de-campo | '{' id-de-columna '}'
llamada    := ('round'|'min'|'max'|'abs') '(' [expresión (',' expresión)*] ')'
```

### 3.2 Salvaguardas y Límites de Seguridad
1. **Lista blanca estricta de identificadores:**
   - Funciones: únicamente `round`, `min`, `max`, `abs`.
   - Campos nativos de marca: únicamente `strokeWidth`, `opacity`, `pageIndex`.
   - Cualquier otro identificador (`window`, `process`, `constructor`, `__proto__`, etc.) es rechazado en fase léxica sin evaluar.
2. **Límites cuantitativos rígidos:**
   - Longitud máxima de expresión: 500 caracteres (`MAX_EXPRESSION_LENGTH`).
   - Profundidad máxima del AST / recursión: 20 niveles (`MAX_AST_DEPTH`).
   - Máximo de llamadas a función: 64 (`MAX_FUNCTION_CALLS`).
   - Máximo de tokens por expresión: 300 (`MAX_TOKENS`).
   - Magnitud numérica máxima: $10^{15}$ (`MAX_MAGNITUDE`); magnitudes superiores se degradan de forma controlada a error `OVERFLOW`.
3. **Prohibición absoluta:** sin `eval`, sin `new Function`, sin notación científica exponencial (`1e3`), sin bases hex/octales y sin acceso dinámico arbitrario a propiedades.

### 3.3 Grafo de Dependencias y Ciclos
- Al evaluar fórmulas que referencian otras columnas `{colId}`, se construye el grafo de dependencias en tiempo de ejecución.
- Si se detecta auto-referencia directa (`{A} + 1`), ciclo mutuo (`{A} <-> {B}`) o ciclo indirecto triangular (`A -> B -> C -> A`), el evaluador interrumpe la recursión de inmediato y emite el código de error `CYCLE`.

### 3.4 Códigos de Error Controlados a Nivel de Celda
Ninguna expresión matemática inválida o fallida lanza excepciones no controladas ni propaga `NaN`/`Infinity` a la interfaz. Se definen códigos canónicos tipados:
- `DIV0`: División por cero.
- `NAN`: Resultado no numérico o argumento inválido.
- `OVERFLOW`: Magnitud numérica excesiva ($> 10^{15}$).
- `REF`: Columna o campo inexistente, no numérico o valor faltante.
- `CYCLE`: Dependencia circular detectada.
- `DEPTH`: Profundidad de anidación excedida.

Las celdas de la tabla muestran badges informativos en color diferenciado (`#DIV0!`, `#REF!`, etc.) con tooltip explicativo en español.

### 3.5 Ordenación, Filtrado e Inmutabilidad
- El motor puro `src/utils/markupFilterSort.ts` admite `custom:<colId>`.
- Orden numérico para números y fórmulas; orden alfabético insensible a mayúsculas y acentos (`sensitivity: 'base'`) para texto y opciones.
- **Regla no negociable:** Los valores vacíos y errores de cálculo se sitúan obligatoriamente al final de la lista, tanto en orden ascendente como descendente.
- Desempate determinista estable por `markup.id`.

### 3.6 Comandos de Historial y Ciclo de Persistencia
- Las modificaciones de valores de celdas en marcas se ejecutan a través de `UpdateMarkupCustomFieldCommand`, garantizando atomicidad y soporte completo de deshacer/rehacer (`Ctrl+Z` / `Ctrl+Y`).
- La creación, modificación o eliminación de columnas en `useDocumentStore` activa la bandera `isDirty` en `useMarkupStore`, garantizando que el servicio de autoguardado (`useAutoSave`) persista las definiciones y valores en el archivo hermano `<plano>.bbx.json` bajo el esquema versionado `1.1.0`.
- La eliminación de una columna solicita confirmación explícita al usuario y purga los valores asociados de `customFields` en todas las marcas.

---

## 4. Consecuencias

### Positivas
- Seguridad garantizada por diseño sin superficie de ataque para inyección de código.
- Rendimiento ultra-rápido: filtrado y ordenación de 500 marcas en $< 15\text{ ms}$; evaluación de 500 marcas $\times$ 3 fórmulas en $< 50\text{ ms}$.
- Persistencia transparente y retrocompatible en `.bbx.json`.
- Experiencia de usuario consistente con los estándares de software CAD profesional (Bluebeam Revu).

### Mitigaciones
- Operaciones matemáticas avanzadas (trigonométricas, exponenciales) o condicionales no están incluidas en esta versión y requerirán enmiendas de gramática en fases posteriores si el alcance lo demanda.

---

## 5. Evidencia de Verificación

1. **Parser y Corpus Hostil:** `src/core/columns/parser.test.ts` (42 pruebas unitarias y de propiedad determinista con oráculo RPN sobre $\ge 1000$ expresiones).
2. **Evaluador y Ciclos:** `src/core/columns/evaluate.test.ts` (11 pruebas unitarias y benchmark $< 50\text{ ms}$).
3. **Motor de Filtrado y Ordenación:** `src/utils/markupFilterSort.test.ts` (24 pruebas unitarias y benchmark $< 15\text{ ms}$).
4. **Componente de UI:** `src/components/MarkupsListCustomColumns.test.tsx` (4 pruebas con Testing Library cubriendo creación, edición con undo, badges de error y eliminación).
5. **Persistencia en Fichero Real:** `src/services/bbxPersistenceService.test.ts` (ida y vuelta sobre disco real con parseo y evaluación dinámica).
6. **E2E Playwright:** `tests/e2e/pdf-viewer.spec.ts` (`Sub-entregable P2-C.3: Columnas personalizadas con parser de gramática cerrada, edición en línea y ordenación`).
