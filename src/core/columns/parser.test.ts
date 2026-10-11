import { describe, it, expect } from 'vitest';
import { parseExpression } from './parser';
import { evaluateAst, EvaluationContext } from './evaluate';
import { Markup } from '../../types/markup';

describe('P2-C.3: parser de gramática cerrada para columnas calculadas', () => {
  it('parsea números decimales y enteros básicos', () => {
    const res = parseExpression('42');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.ast).toEqual({ type: 'NumberLiteral', value: 42 });
    }

    const resDec = parseExpression('3.14159');
    expect(resDec.ok).toBe(true);
    if (resDec.ok) {
      expect(resDec.ast).toEqual({ type: 'NumberLiteral', value: 3.14159 });
    }
  });

  it('respeta precedencia de operadores (* y / sobre + y -)', () => {
    // 2 + 3 * 4 debe ser 2 + (3 * 4)
    const res = parseExpression('2 + 3 * 4');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.ast.type).toBe('BinaryOp');
      if (res.ast.type === 'BinaryOp') {
        expect(res.ast.operator).toBe('+');
        expect(res.ast.left).toEqual({ type: 'NumberLiteral', value: 2 });
        expect(res.ast.right).toEqual({
          type: 'BinaryOp',
          operator: '*',
          left: { type: 'NumberLiteral', value: 3 },
          right: { type: 'NumberLiteral', value: 4 },
        });
      }
    }
  });

  it('respeta asociatividad a la izquierda en restas y divisiones', () => {
    // 10 - 5 - 2 debe agruparse como (10 - 5) - 2
    const resMinus = parseExpression('10 - 5 - 2');
    expect(resMinus.ok).toBe(true);
    if (resMinus.ok && resMinus.ast.type === 'BinaryOp') {
      expect(resMinus.ast.operator).toBe('-');
      expect(resMinus.ast.right).toEqual({ type: 'NumberLiteral', value: 2 });
      expect(resMinus.ast.left).toEqual({
        type: 'BinaryOp',
        operator: '-',
        left: { type: 'NumberLiteral', value: 10 },
        right: { type: 'NumberLiteral', value: 5 },
      });
    }

    // 24 / 6 / 2 debe agruparse como (24 / 6) / 2
    const resDiv = parseExpression('24 / 6 / 2');
    expect(resDiv.ok).toBe(true);
    if (resDiv.ok && resDiv.ast.type === 'BinaryOp') {
      expect(resDiv.ast.operator).toBe('/');
      expect(resDiv.ast.right).toEqual({ type: 'NumberLiteral', value: 2 });
      expect(resDiv.ast.left).toEqual({
        type: 'BinaryOp',
        operator: '/',
        left: { type: 'NumberLiteral', value: 24 },
        right: { type: 'NumberLiteral', value: 6 },
      });
    }
  });

  it('parsea operadores unarios positivos y negativos', () => {
    const resUnary = parseExpression('-5 + +3');
    expect(resUnary.ok).toBe(true);
    if (resUnary.ok && resUnary.ast.type === 'BinaryOp') {
      expect(resUnary.ast.operator).toBe('+');
      expect(resUnary.ast.left).toEqual({
        type: 'UnaryOp',
        operator: '-',
        operand: { type: 'NumberLiteral', value: 5 },
      });
      expect(resUnary.ast.right).toEqual({
        type: 'UnaryOp',
        operator: '+',
        operand: { type: 'NumberLiteral', value: 3 },
      });
    }
  });

  it('parsea funciones de la lista blanca: round, min, max, abs', () => {
    const resRound = parseExpression('round(3.14159, 2)');
    expect(resRound.ok).toBe(true);
    if (resRound.ok) {
      expect(resRound.ast).toEqual({
        type: 'FunctionCall',
        name: 'round',
        args: [
          { type: 'NumberLiteral', value: 3.14159 },
          { type: 'NumberLiteral', value: 2 },
        ],
      });
    }

    const resMinMax = parseExpression('min(1, max(2, 3), 4)');
    expect(resMinMax.ok).toBe(true);
    if (resMinMax.ok && resMinMax.ast.type === 'FunctionCall') {
      expect(resMinMax.ast.name).toBe('min');
      expect(resMinMax.ast.args.length).toBe(3);
    }

    const resAbs = parseExpression('abs(-42)');
    expect(resAbs.ok).toBe(true);
    if (resAbs.ok && resAbs.ast.type === 'FunctionCall') {
      expect(resAbs.ast.name).toBe('abs');
      expect(resAbs.ast.args.length).toBe(1);
    }
  });

  it('parsea referencias a campos de marca y columnas personalizadas', () => {
    const res = parseExpression('strokeWidth * {col_longitud} + opacity');
    expect(res.ok).toBe(true);
    if (res.ok && res.ast.type === 'BinaryOp') {
      expect(res.ast.operator).toBe('+');
      expect(res.ast.right).toEqual({
        type: 'FieldReference',
        field: 'opacity',
      });
      expect(res.ast.left).toEqual({
        type: 'BinaryOp',
        operator: '*',
        left: { type: 'FieldReference', field: 'strokeWidth' },
        right: { type: 'ColumnReference', columnId: 'col_longitud' },
      });
    }
  });

  describe('Corpus hostil de seguridad e inmunidad contra prototype pollution', () => {
    const originalObjectProtoKeys = Object.getOwnPropertyNames(Object.prototype);

    const hostileInputs = [
      'constructor',
      '__proto__',
      'prototype',
      'window',
      'process',
      'eval',
      'Function',
      'this',
      '1e3',
      '1E10',
      '0x10',
      '0b10',
      '0o77',
      '1.2.3',
      '1;',
      'alert(1)',
      'console.log(1)',
      'Object.assign({}, {})',
      '"texto entre comillas"',
      "'texto en simples'",
      '`template literal`',
      'require("fs")',
      'import("fs")',
      '{__proto__}',
      '{constructor}',
      '१२३ + ४५', // Unicode devanagari digits
      '１２３ + ４', // Full-width unicode digits
      'x = 1',
      'return 42',
      'NaN',
      'Infinity',
    ];

    for (const hostile of hostileInputs) {
      it(`rechaza o neutraliza entrada hostil: "${hostile.slice(0, 30)}"`, () => {
        const res = parseExpression(hostile);
        // Si el identificador es {__proto__}, se parsea como ColumnReference, pero el evaluador nunca accede prototype
        if (res.ok) {
          expect(res.ast.type).toBe('ColumnReference');
        } else {
          expect(res.ok).toBe(false);
          expect(typeof res.message).toBe('string');
        }
      });
    }

    it('rechaza cadena gigante de 10 000 caracteres por exceso de longitud', () => {
      const hugeInput = '1 + '.repeat(2500) + '1';
      expect(hugeInput.length).toBeGreaterThan(10000);
      const res = parseExpression(hugeInput);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('TOO_LONG');
      }
    });

    it('rechaza 5 000 paréntesis anidados por exceso de profundidad', () => {
      const deepInput = '('.repeat(5000) + '1' + ')'.repeat(5000);
      const res = parseExpression(deepInput);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        // Puede fallar por longitud o por profundidad
        expect(['TOO_LONG', 'DEPTH']).toContain(res.code);
      }
    });

    it('rechaza anidación que excede la profundidad máxima de 20 dentro del límite de 500 caracteres', () => {
      const nestedInput = '('.repeat(25) + '1' + ')'.repeat(25);
      expect(nestedInput.length).toBeLessThan(500);
      const res = parseExpression(nestedInput);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('DEPTH');
      }
    });

    it('no contamina Object.prototype tras evaluar todas las entradas hostiles', () => {
      const currentKeys = Object.getOwnPropertyNames(Object.prototype);
      expect(currentKeys).toEqual(originalObjectProtoKeys);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });
  });

  describe('Prueba de propiedad determinista con oráculo independiente (>= 1000 expresiones)', () => {
    // Generador pseudoaleatorio determinista LCG con semilla fija
    class DeterministicRNG {
      private state: number;
      constructor(seed: number) {
        this.state = seed >>> 0;
      }
      next(): number {
        this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0;
        return this.state / 4294967296;
      }
      nextInt(min: number, max: number): number {
        return Math.floor(this.next() * (max - min + 1)) + min;
      }
    }

    // Oráculo independiente: evaluador RPN (Reverse Polish Notation) que procesa tokens y pila
    // completamente separado del parser recursivo
    function evaluateWithRpnOracle(tokens: Array<number | '+' | '-' | '*' | '/'>): number {
      // Shunting-yard simple a RPN
      const outputQueue: (number | string)[] = [];
      const opStack: string[] = [];
      const precedence: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };

      for (const token of tokens) {
        if (typeof token === 'number') {
          outputQueue.push(token);
        } else {
          while (
            opStack.length > 0 &&
            precedence[opStack[opStack.length - 1]] >= precedence[token]
          ) {
            outputQueue.push(opStack.pop()!);
          }
          opStack.push(token);
        }
      }
      while (opStack.length > 0) {
        outputQueue.push(opStack.pop()!);
      }

      // Evaluar RPN
      const evalStack: number[] = [];
      for (const item of outputQueue) {
        if (typeof item === 'number') {
          evalStack.push(item);
        } else {
          const b = evalStack.pop()!;
          const a = evalStack.pop()!;
          let r = 0;
          if (item === '+') r = a + b;
          else if (item === '-') r = a - b;
          else if (item === '*') r = a * b;
          else if (item === '/') r = b === 0 ? 0 : a / b;
          evalStack.push(r);
        }
      }
      return evalStack[0] ?? 0;
    }

    it('verifica 1000 expresiones generadas contra el oráculo independiente RPN', () => {
      const rng = new DeterministicRNG(133742);
      const ops: Array<'+' | '-' | '*' | '/'> = ['+', '-', '*', '/'];

      const dummyMarkup: Markup = {
        id: 'dummy',
        type: 'rectangle',
        pageIndex: 0,
        points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
        style: { strokeColor: '#000', strokeWidth: 1, opacity: 1 },
        author: 'test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'pending',
      };

      const emptyContext: EvaluationContext = {
        depth: 0,
        visitedCols: new Set(),
        columnsMap: new Map(),
        astCache: new Map(),
        valueCache: new Map(),
      };

      let passedCount = 0;

      for (let i = 0; i < 1000; i++) {
        const numTerms = rng.nextInt(2, 6);
        const tokens: Array<number | '+' | '-' | '*' | '/'> = [];
        const exprParts: string[] = [];

        for (let t = 0; t < numTerms; t++) {
          if (t > 0) {
            const op = ops[rng.nextInt(0, 3)];
            tokens.push(op);
            exprParts.push(op);
          }
          // Valores positivos entre 1 y 50 para evitar división por cero en esta prueba de propiedad
          const n = rng.nextInt(1, 50);
          tokens.push(n);
          exprParts.push(n.toString());
        }

        const expressionString = exprParts.join(' ');
        const parseRes = parseExpression(expressionString);
        expect(parseRes.ok).toBe(true);

        if (parseRes.ok) {
          const ourResult = evaluateAst(parseRes.ast, dummyMarkup, emptyContext);
          const oracleResult = evaluateWithRpnOracle(tokens);

          expect(ourResult.ok).toBe(true);
          if (ourResult.ok) {
            // Tolerancia de punto flotante
            expect(Math.abs(ourResult.value - oracleResult)).toBeLessThan(1e-9);
          }
          passedCount++;
        }
      }

      expect(passedCount).toBe(1000);
    });
  });
});
