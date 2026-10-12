import {
  ExpressionNode,
  ParseResult,
  Token,
  TokenType,
  WhitelistedField,
  WhitelistedFunction,
  MAX_EXPRESSION_LENGTH,
  MAX_AST_DEPTH,
  MAX_FUNCTION_CALLS,
  MAX_TOKENS,
  WHITELISTED_MARKUP_FIELDS,
  WHITELISTED_FUNCTIONS,
} from './ast';

const FIELD_SET: ReadonlySet<string> = new Set(WHITELISTED_MARKUP_FIELDS);
const FUNCTION_SET: ReadonlySet<string> = new Set(WHITELISTED_FUNCTIONS);

/**
 * Tokenizador puro para expresiones de columnas calculadas.
 */
function tokenize(input: string): { ok: true; tokens: Token[] } | { ok: false; code: string; message: string; position: number } {
  const tokens: Token[] = [];
  let pos = 0;
  const len = input.length;

  while (pos < len) {
    const ch = input[pos];

    // Espacios en blanco
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      pos++;
      continue;
    }

    // Operadores y delimitadores simples
    if (ch === '+') {
      tokens.push({ type: 'PLUS', value: '+', position: pos });
      pos++;
      continue;
    }
    if (ch === '-') {
      tokens.push({ type: 'MINUS', value: '-', position: pos });
      pos++;
      continue;
    }
    if (ch === '*') {
      tokens.push({ type: 'STAR', value: '*', position: pos });
      pos++;
      continue;
    }
    if (ch === '/') {
      tokens.push({ type: 'SLASH', value: '/', position: pos });
      pos++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'LPAREN', value: '(', position: pos });
      pos++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'RPAREN', value: ')', position: pos });
      pos++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'COMMA', value: ',', position: pos });
      pos++;
      continue;
    }

    // Referencia a columna: {id_columna}
    if (ch === '{') {
      const closeIdx = input.indexOf('}', pos + 1);
      if (closeIdx === -1) {
        return {
          ok: false,
          code: 'UNCLOSED_COL_REF',
          message: "Unclosed column reference: missing '}'",
          position: pos,
        };
      }
      const rawId = input.slice(pos + 1, closeIdx).trim();
      if (rawId.length === 0) {
        return {
          ok: false,
          code: 'EMPTY_COL_REF',
          message: 'Empty column reference between braces',
          position: pos,
        };
      }
      // Validar formato del identificador de columna (alfanumérico, guiones, barras bajas)
      if (!/^[a-zA-Z0-9_\-]+$/.test(rawId)) {
        return {
          ok: false,
          code: 'INVALID_COL_REF',
          message: `Invalid column identifier: '${rawId}'`,
          position: pos,
        };
      }
      tokens.push({ type: 'COL_REF', value: rawId, position: pos });
      pos = closeIdx + 1;
      continue;
    }

    // Números: digitos [. digitos]
    if (ch >= '0' && ch <= '9') {
      const start = pos;
      while (pos < len && input[pos] >= '0' && input[pos] <= '9') {
        pos++;
      }
      if (pos < len && input[pos] === '.') {
        // Verificar que tras el punto haya al menos un dígito
        if (pos + 1 >= len || !(input[pos + 1] >= '0' && input[pos + 1] <= '9')) {
          return {
            ok: false,
            code: 'INVALID_NUMBER',
            message: 'Incomplete decimal number after the point',
            position: pos,
          };
        }
        pos++; // consumimos el punto
        while (pos < len && input[pos] >= '0' && input[pos] <= '9') {
          pos++;
        }
      }
      // Verificar que no le siga un carácter alfabético (ej. 1e3, 0x10, 123abc)
      if (pos < len && /[a-zA-Z_]/.test(input[pos])) {
        return {
          ok: false,
          code: 'INVALID_NUMBER_SUFFIX',
          message: `Notation or suffix not allowed in number at position ${pos}`,
          position: pos,
        };
      }
      const numStr = input.slice(start, pos);
      tokens.push({ type: 'NUMBER', value: numStr, position: start });
      continue;
    }

    // Identificadores (funciones o campos)
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
      const start = pos;
      while (
        pos < len &&
        ((input[pos] >= 'a' && input[pos] <= 'z') ||
          (input[pos] >= 'A' && input[pos] <= 'Z') ||
          (input[pos] >= '0' && input[pos] <= '9') ||
          input[pos] === '_')
      ) {
        pos++;
      }
      const ident = input.slice(start, pos);

      if (FUNCTION_SET.has(ident)) {
        tokens.push({ type: 'FUNCTION', value: ident, position: start });
      } else if (FIELD_SET.has(ident)) {
        tokens.push({ type: 'FIELD_REF', value: ident, position: start });
      } else {
        return {
          ok: false,
          code: 'UNKNOWN_IDENTIFIER',
          message: `Unknown or not allowed identifier: '${ident}'`,
          position: start,
        };
      }
      continue;
    }

    // Carácter no reconocido
    return {
      ok: false,
      code: 'UNEXPECTED_CHAR',
      message: `Character not allowed: '${ch}'`,
      position: pos,
    };
  }

  if (tokens.length > MAX_TOKENS) {
    return {
      ok: false,
      code: 'TOO_MANY_TOKENS',
      message: `The expression exceeds the token limit (${MAX_TOKENS})`,
      position: 0,
    };
  }

  tokens.push({ type: 'EOF', value: '', position: pos });
  return { ok: true, tokens };
}

/**
 * Parsea una expresión según la gramática cerrada.
 */
export function parseExpression(expression: string): ParseResult {
  if (typeof expression !== 'string') {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: 'The expression must be a string',
      position: 0,
    };
  }

  const trimmed = expression.trim();
  if (trimmed.length === 0) {
    return {
      ok: false,
      code: 'EMPTY',
      message: 'The expression cannot be empty',
      position: 0,
    };
  }

  if (expression.length > MAX_EXPRESSION_LENGTH) {
    return {
      ok: false,
      code: 'TOO_LONG',
      message: `The expression exceeds the limit of ${MAX_EXPRESSION_LENGTH} characters`,
      position: MAX_EXPRESSION_LENGTH,
    };
  }

  const tokenRes = tokenize(expression);
  if (!tokenRes.ok) {
    return tokenRes;
  }

  const tokens = tokenRes.tokens;
  let cursor = 0;
  let functionCalls = 0;

  function current(): Token {
    return tokens[cursor] ?? { type: 'EOF', value: '', position: expression.length };
  }

  function advance(): Token {
    const t = current();
    cursor++;
    return t;
  }

  function match(type: TokenType): boolean {
    if (current().type === type) {
      advance();
      return true;
    }
    return false;
  }

  // Gramática:
  // expresión  := término (('+'|'-') término)*
  // término    := factor (('*'|'/') factor)*
  // factor     := ('+'|'-') factor | número | referencia | llamada | '(' expresión ')'
  // llamada    := ('round'|'min'|'max'|'abs') '(' [expresión (',' expresión)*] ')'

  type Result<T> = { ok: true; node: T } | { ok: false; code: string; message: string; position: number };

  function parseFactor(depth: number): Result<ExpressionNode> {
    if (depth > MAX_AST_DEPTH) {
      return {
        ok: false,
        code: 'DEPTH',
        message: `The expression exceeds the nesting limit (maximum ${MAX_AST_DEPTH})`,
        position: current().position,
      };
    }

    const tok = current();

    // Operador unario + o -
    if (tok.type === 'PLUS' || tok.type === 'MINUS') {
      advance();
      const operandRes = parseFactor(depth + 1);
      if (!operandRes.ok) return operandRes;
      return {
        ok: true,
        node: {
          type: 'UnaryOp',
          operator: tok.value as '+' | '-',
          operand: operandRes.node,
        },
      };
    }

    // Número
    if (tok.type === 'NUMBER') {
      advance();
      const parsedNum = Number(tok.value);
      if (!Number.isFinite(parsedNum)) {
        return {
          ok: false,
          code: 'INVALID_NUMBER',
          message: `Non-finite number: '${tok.value}'`,
          position: tok.position,
        };
      }
      return {
        ok: true,
        node: {
          type: 'NumberLiteral',
          value: parsedNum,
        },
      };
    }

    // Campo de la marca
    if (tok.type === 'FIELD_REF') {
      advance();
      return {
        ok: true,
        node: {
          type: 'FieldReference',
          field: tok.value as WhitelistedField,
        },
      };
    }

    // Columna personalizada
    if (tok.type === 'COL_REF') {
      advance();
      return {
        ok: true,
        node: {
          type: 'ColumnReference',
          columnId: tok.value,
        },
      };
    }

    // Llamada a función
    if (tok.type === 'FUNCTION') {
      const funcTok = advance();
      functionCalls++;
      if (functionCalls > MAX_FUNCTION_CALLS) {
        return {
          ok: false,
          code: 'TOO_MANY_CALLS',
          message: `The expression exceeds the function call limit (${MAX_FUNCTION_CALLS})`,
          position: funcTok.position,
        };
      }

      if (!match('LPAREN')) {
        return {
          ok: false,
          code: 'EXPECTED_LPAREN',
          message: `Expected '(' after the function name '${funcTok.value}'`,
          position: current().position,
        };
      }

      const args: ExpressionNode[] = [];
      if (current().type !== 'RPAREN') {
        const firstArg = parseExpr(depth + 1);
        if (!firstArg.ok) return firstArg;
        args.push(firstArg.node);

        while (match('COMMA')) {
          const nextArg = parseExpr(depth + 1);
          if (!nextArg.ok) return nextArg;
          args.push(nextArg.node);
        }
      }

      if (!match('RPAREN')) {
        return {
          ok: false,
          code: 'EXPECTED_RPAREN',
          message: `Expected ')' to close the call to '${funcTok.value}'`,
          position: current().position,
        };
      }

      const funcName = funcTok.value as WhitelistedFunction;

      // Validación de aridad
      if (funcName === 'abs' && args.length !== 1) {
        return {
          ok: false,
          code: 'INVALID_ARITY',
          message: `Function 'abs' requires exactly 1 argument (${args.length} given)`,
          position: funcTok.position,
        };
      }
      if (funcName === 'round' && (args.length < 1 || args.length > 2)) {
        return {
          ok: false,
          code: 'INVALID_ARITY',
          message: `Function 'round' requires 1 or 2 arguments (${args.length} given)`,
          position: funcTok.position,
        };
      }
      if ((funcName === 'min' || funcName === 'max') && args.length < 1) {
        return {
          ok: false,
          code: 'INVALID_ARITY',
          message: `Function '${funcName}' requires at least 1 argument`,
          position: funcTok.position,
        };
      }

      return {
        ok: true,
        node: {
          type: 'FunctionCall',
          name: funcName,
          args,
        },
      };
    }

    // Paréntesis (expresión)
    if (match('LPAREN')) {
      const parenPos = tok.position;
      const inner = parseExpr(depth + 1);
      if (!inner.ok) return inner;

      if (!match('RPAREN')) {
        return {
          ok: false,
          code: 'UNCLOSED_PAREN',
          message: "Unclosed opening parenthesis: missing ')'",
          position: parenPos,
        };
      }
      return inner;
    }

    // Token inesperado
    return {
      ok: false,
      code: 'UNEXPECTED_TOKEN',
      message: `Token inesperado: '${tok.value || tok.type}'`,
      position: tok.position,
    };
  }

  function parseTerm(depth: number): Result<ExpressionNode> {
    if (depth > MAX_AST_DEPTH) {
      return {
        ok: false,
        code: 'DEPTH',
        message: `The expression exceeds the nesting limit (maximum ${MAX_AST_DEPTH})`,
        position: current().position,
      };
    }

    let leftRes = parseFactor(depth + 1);
    if (!leftRes.ok) return leftRes;
    let left = leftRes.node;

    while (current().type === 'STAR' || current().type === 'SLASH') {
      const opTok = advance();
      const rightRes = parseFactor(depth + 1);
      if (!rightRes.ok) return rightRes;
      left = {
        type: 'BinaryOp',
        operator: opTok.value as '*' | '/',
        left,
        right: rightRes.node,
      };
    }

    return { ok: true, node: left };
  }

  function parseExpr(depth: number): Result<ExpressionNode> {
    if (depth > MAX_AST_DEPTH) {
      return {
        ok: false,
        code: 'DEPTH',
        message: `The expression exceeds the nesting limit (maximum ${MAX_AST_DEPTH})`,
        position: current().position,
      };
    }

    let leftRes = parseTerm(depth + 1);
    if (!leftRes.ok) return leftRes;
    let left = leftRes.node;

    while (current().type === 'PLUS' || current().type === 'MINUS') {
      const opTok = advance();
      const rightRes = parseTerm(depth + 1);
      if (!rightRes.ok) return rightRes;
      left = {
        type: 'BinaryOp',
        operator: opTok.value as '+' | '-',
        left,
        right: rightRes.node,
      };
    }

    return { ok: true, node: left };
  }

  const rootRes = parseExpr(0);
  if (!rootRes.ok) {
    return rootRes;
  }

  if (current().type !== 'EOF') {
    return {
      ok: false,
      code: 'TRAILING_TOKENS',
      message: `Unexpected content after the end of the expression: '${current().value || current().type}'`,
      position: current().position,
    };
  }

  return { ok: true, ast: rootRes.node };
}
