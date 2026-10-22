/**
 * Lector de flujos de contenido PDF (ADR-0103). Trabaja sobre una cadena de un byte por carácter (latin1), para que los
 * datos binarios (imágenes en línea, cadenas) pasen sin alterarse. Devuelve las operaciones con su texto original, de
 * modo que lo que no se edita se vuelve a escribir idéntico.
 */

export type Operand =
  | { t: 'num'; v: number }
  | { t: 'name'; v: string }
  | { t: 'str'; v: string }
  | { t: 'arr'; items: Operand[] }
  | { t: 'raw'; text: string };

export interface Operation {
  op: string;
  operands: Operand[];
  /** Texto original de la operación (operandos y operador). */
  src: string;
  /** Datos de una imagen en línea (BI … ID … EI), si es una. */
  inline?: { dict: string; data: string };
}

const WS = new Set([0, 9, 10, 12, 13, 32]);
const DELIM = new Set(['(', ')', '<', '>', '[', ']', '{', '}', '/', '%']);

const isWs = (c: number) => WS.has(c);

class Reader {
  pos = 0;
  constructor(readonly s: string) {}

  skipWs() {
    while (this.pos < this.s.length) {
      const c = this.s.charCodeAt(this.pos);
      if (isWs(c)) this.pos++;
      else if (c === 0x25) {
        while (this.pos < this.s.length && this.s[this.pos] !== '\n' && this.s[this.pos] !== '\r') this.pos++;
      } else break;
    }
  }

  literalString(): string {
    // Lee "(…)" con paréntesis anidados y escapes; devuelve los bytes ya decodificados
    let depth = 1;
    let out = '';
    this.pos++;
    while (this.pos < this.s.length && depth > 0) {
      const ch = this.s[this.pos++];
      if (ch === '\\') {
        const n = this.s[this.pos++];
        if (n === 'n') out += '\n';
        else if (n === 'r') out += '\r';
        else if (n === 't') out += '\t';
        else if (n === 'b') out += '\b';
        else if (n === 'f') out += '\f';
        else if (n >= '0' && n <= '7') {
          let oct = n;
          for (let i = 0; i < 2 && this.s[this.pos] >= '0' && this.s[this.pos] <= '7'; i++) oct += this.s[this.pos++];
          out += String.fromCharCode(parseInt(oct, 8) & 0xff);
        } else if (n === '\r') {
          if (this.s[this.pos] === '\n') this.pos++;
        } else if (n !== '\n') out += n;
      } else if (ch === '(') {
        depth++;
        out += ch;
      } else if (ch === ')') {
        depth--;
        if (depth > 0) out += ch;
      } else out += ch;
    }
    return out;
  }

  hexString(): string {
    this.pos++;
    let hex = '';
    while (this.pos < this.s.length && this.s[this.pos] !== '>') {
      const ch = this.s[this.pos++];
      if (/[0-9a-fA-F]/.test(ch)) hex += ch;
    }
    this.pos++;
    if (hex.length % 2) hex += '0';
    let out = '';
    for (let i = 0; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    return out;
  }

  token(): string {
    const start = this.pos;
    while (this.pos < this.s.length && !isWs(this.s.charCodeAt(this.pos)) && !DELIM.has(this.s[this.pos])) this.pos++;
    return this.s.slice(start, this.pos);
  }

  /** Un operando (número, nombre, cadena, matriz, diccionario) o un operador. Devuelve null al terminar. */
  next(): { kind: 'operand'; operand: Operand } | { kind: 'op'; name: string } | null {
    this.skipWs();
    if (this.pos >= this.s.length) return null;
    const ch = this.s[this.pos];
    if (ch === '(') return { kind: 'operand', operand: { t: 'str', v: this.literalString() } };
    if (ch === '<') {
      if (this.s[this.pos + 1] === '<') {
        const start = this.pos;
        let depth = 0;
        while (this.pos < this.s.length) {
          if (this.s.startsWith('<<', this.pos)) {
            depth++;
            this.pos += 2;
          } else if (this.s.startsWith('>>', this.pos)) {
            depth--;
            this.pos += 2;
            if (depth === 0) break;
          } else if (this.s[this.pos] === '(') this.literalString();
          else this.pos++;
        }
        return { kind: 'operand', operand: { t: 'raw', text: this.s.slice(start, this.pos) } };
      }
      return { kind: 'operand', operand: { t: 'str', v: this.hexString() } };
    }
    if (ch === '[') {
      this.pos++;
      const items: Operand[] = [];
      for (;;) {
        this.skipWs();
        if (this.pos >= this.s.length) break;
        if (this.s[this.pos] === ']') {
          this.pos++;
          break;
        }
        const n = this.next();
        if (!n) break;
        if (n.kind === 'operand') items.push(n.operand);
      }
      return { kind: 'operand', operand: { t: 'arr', items } };
    }
    if (ch === '/') {
      this.pos++;
      return { kind: 'operand', operand: { t: 'name', v: this.token() } };
    }
    if (DELIM.has(ch)) {
      this.pos++;
      return this.next();
    }
    const tok = this.token();
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(tok)) return { kind: 'operand', operand: { t: 'num', v: parseFloat(tok) } };
    if (tok === 'true' || tok === 'false' || tok === 'null') return { kind: 'operand', operand: { t: 'raw', text: tok } };
    return { kind: 'op', name: tok };
  }
}

/** Lee todas las operaciones de un flujo de contenido. */
export function parseContentStream(stream: string): Operation[] {
  const r = new Reader(stream);
  const ops: Operation[] = [];
  let operands: Operand[] = [];
  let opStart = 0;
  for (;;) {
    r.skipWs();
    if (operands.length === 0) opStart = r.pos;
    const n = r.next();
    if (!n) break;
    if (n.kind === 'operand') {
      operands.push(n.operand);
      continue;
    }
    const operation: Operation = { op: n.name, operands, src: '' };
    if (n.name === 'BI') {
      // Imagen en línea: diccionario hasta ID, datos binarios hasta EI
      const dictStart = r.pos;
      let idAt = -1;
      for (let i = r.pos; i < stream.length - 1; i++) {
        if (stream[i] === 'I' && stream[i + 1] === 'D' && isWs(stream.charCodeAt(i - 1)) && (i + 2 >= stream.length || isWs(stream.charCodeAt(i + 2)))) {
          idAt = i;
          break;
        }
      }
      if (idAt >= 0) {
        const dataStart = idAt + 3;
        let eiAt = -1;
        for (let i = dataStart; i < stream.length - 1; i++) {
          if (stream[i] === 'E' && stream[i + 1] === 'I' && isWs(stream.charCodeAt(i - 1)) && (i + 2 >= stream.length || isWs(stream.charCodeAt(i + 2)))) {
            eiAt = i;
            break;
          }
        }
        if (eiAt >= 0) {
          operation.inline = { dict: stream.slice(dictStart, idAt), data: stream.slice(dataStart, eiAt) };
          r.pos = eiAt + 2;
        }
      }
    }
    operation.src = stream.slice(opStart, r.pos);
    ops.push(operation);
    operands = [];
  }
  return ops;
}

// ── Escritura de operandos ──────────────────────────────────────────────────────────────────────────────────────────

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1e5) / 1e5));

/** Cadena como hexadecimal: no necesita escapes y conserva los bytes. */
export const hexOf = (s: string) => '<' + Array.from(s, (c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('').toUpperCase() + '>';

export function writeOperand(o: Operand): string {
  switch (o.t) {
    case 'num':
      return fmt(o.v);
    case 'name':
      return '/' + o.v;
    case 'str':
      return hexOf(o.v);
    case 'arr':
      return '[' + o.items.map(writeOperand).join(' ') + ']';
    default:
      return o.text;
  }
}

export const writeOperation = (op: string, operands: Operand[]) => (operands.length ? operands.map(writeOperand).join(' ') + ' ' : '') + op;
