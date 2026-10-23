# ADR-0122: Panel Signatures

- **Estado:** Aceptado
- **Fecha:** 2026-10-23

## 1. Contexto

Último de los paneles de Revu pendientes. REA ya firmaba con certificado (ADR-0056) y verificaba la firma (ADR-0058),
pero solo desde las propiedades de un campo: no había una vista de todas las firmas del documento ni un sitio donde
comprobar su validez.

## 2. Decisión

1. **Panel Signatures** (pestaña del riel izquierdo y `View ▸ Panels ▸ Signatures Panel`): los campos de firma del
   documento por página y posición, firmados o pendientes. Un campo firmado muestra firmante, fecha, motivo y lugar; uno
   pendiente tiene *Sign…*. Cabecera "N of M signed" y *Next unsigned*.
2. **Firmar** sigue haciéndose con el certificado en las propiedades del campo (ADR-0056): *Sign…* lleva al campo, lo
   selecciona y abre el panel de propiedades. El panel no pide ni guarda contraseñas.
3. **Verify** ejecuta la verificación criptográfica ya existente sobre el PDF abierto y cuenta el resultado con cuatro
   desenlaces: válida, válida pero con cambios posteriores (la firma solo cubre lo que firmó; por ejemplo, marcas
   añadidas después), no válida (documento alterado o firma dañada) y sin firma digital; cualquier otro fallo se explica.
   El resultado se borra al cambiar el documento.
4. **Corrección en la verificación:** el motivo y el lugar solo se leían si estaban entre paréntesis; con acentos (por
   ejemplo "Ciudad de México") el PDF los guarda en hexadecimal UTF-16 y no salían. `readSignatureText` lee ambas formas.

## 3. Alcance y límites

- Verifica la primera firma del documento (la verificación existente), no cada una por separado, y no valida la cadena de
  confianza del certificado: un certificado autofirmado sale válido si la firma coincide.
- No quita ni cambia firmas: una firma es del archivo.
- Las firmas dibujadas a mano o importadas como imagen no son firmas digitales y no se listan aquí.

## 4. Pruebas

- `src/core/markup/signatureList.test.ts` (6): qué campos cuentan, datos de una firma, siguiente sin firmar, fecha y
  los cinco desenlaces de la verificación.
- `src/components/panels/SignaturesPanel.test.tsx` (8): lista, Sign…, siguiente sin firmar, PDF sin firma, **un PDF
  firmado de verdad con certificado autofirmado** (válido, con firmante, motivo y lugar con acentos), un PDF alterado,
  limpieza del resultado, menú y pestaña.
- `src/core/pdf/signatureText.test.ts` (4): literal, hexadecimal UTF-16, hexadecimal simple y clave ausente.
- E2E `Signatures (ADR-0122)`: un campo de firma real, Verify sin firma y *Sign…* abriendo las propiedades.
