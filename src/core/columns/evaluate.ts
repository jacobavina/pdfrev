import {
  ExpressionNode,
  EvaluationResult,
  MAX_MAGNITUDE,
  MAX_AST_DEPTH,
} from './ast';
import { parseExpression } from './parser';
import { Markup, BbxCustomColumn } from '../../types/markup';

export interface EvaluationContext {
  depth: number;
  visitedCols: Set<string>;
  columnsMap: Map<string, BbxCustomColumn>;
  astCache: Map<string, ExpressionNode | null>;
  valueCache: Map<string, EvaluationResult>; // clave: `${markup.id}:${colId}`
}

/**
 * Evalúa un AST sobre una marca dada con soporte para columnas calculadas y dependencias.
 */
export function evaluateAst(
  ast: ExpressionNode,
  markup: Markup,
  context: EvaluationContext,
): EvaluationResult {
  if (context.depth > MAX_AST_DEPTH) {
    return {
      ok: false,
      error: 'DEPTH',
      message: `Profundidad de evaluación excedida (máximo ${MAX_AST_DEPTH})`,
    };
  }

  switch (ast.type) {
    case 'NumberLiteral': {
      if (!Number.isFinite(ast.value) || Math.abs(ast.value) > MAX_MAGNITUDE) {
        return {
          ok: false,
          error: 'OVERFLOW',
          message: 'Magnitud numérica no permitida o no finita',
        };
      }
      return { ok: true, value: ast.value };
    }

    case 'FieldReference': {
      let val: number | undefined;
      if (ast.field === 'strokeWidth') {
        val = markup.style?.strokeWidth;
      } else if (ast.field === 'opacity') {
        val = markup.style?.opacity;
      } else if (ast.field === 'pageIndex') {
        val = markup.pageIndex;
      }

      if (val === undefined || !Number.isFinite(val)) {
        return {
          ok: false,
          error: 'REF',
          message: `El campo de marca '${ast.field}' no contiene un valor numérico finito`,
        };
      }

      if (Math.abs(val) > MAX_MAGNITUDE) {
        return {
          ok: false,
          error: 'OVERFLOW',
          message: `El valor de '${ast.field}' excede la magnitud permitida`,
        };
      }

      return { ok: true, value: val };
    }

    case 'ColumnReference': {
      const colId = ast.columnId;
      let colDef = context.columnsMap.get(colId);

      if (!colDef) {
        for (const c of context.columnsMap.values()) {
          if (
            c.nombre.localeCompare(colId, undefined, { sensitivity: 'base' }) === 0 ||
            c.id.localeCompare(colId, undefined, { sensitivity: 'base' }) === 0
          ) {
            colDef = c;
            break;
          }
        }
      }

      if (!colDef) {
        return {
          ok: false,
          error: 'REF',
          message: `La columna referenciada '{${colId}}' no existe`,
        };
      }

      if (colDef.tipo === 'number') {
        // En columnas numéricas, leer customFields usando colDef.id
        const rawVal = markup.customFields?.[colDef.id];
        if (rawVal === undefined || rawVal === null || rawVal === '') {
          return {
            ok: false,
            error: 'REF',
            message: `Valor faltante en la columna numérica '{${colId}}'`,
          };
        }
        const num = Number(rawVal);
        if (!Number.isFinite(num)) {
          return {
            ok: false,
            error: 'NAN',
            message: `El valor en '{${colId}}' no es un número válido`,
          };
        }
        if (Math.abs(num) > MAX_MAGNITUDE) {
          return {
            ok: false,
            error: 'OVERFLOW',
            message: `El valor en '{${colId}}' excede la magnitud admitida`,
          };
        }
        return { ok: true, value: num };
      }

      if (colDef.tipo === 'formula') {
        const resolvedId = colDef.id;
        // Chequeo de ciclo de dependencias
        if (context.visitedCols.has(resolvedId)) {
          return {
            ok: false,
            error: 'CYCLE',
            message: `Dependencia circular detectada al evaluar '{${colId}}'`,
          };
        }

        const cacheKey = `${markup.id}:${resolvedId}`;
        const cached = context.valueCache.get(cacheKey);
        if (cached) {
          return cached;
        }

        // Obtener AST compilado de la fórmula
        let exprAst = context.astCache.get(resolvedId);
        if (exprAst === undefined) {
          const expr = colDef.expresion ?? '';
          const parseRes = parseExpression(expr);
          if (parseRes.ok) {
            exprAst = parseRes.ast;
          } else {
            exprAst = null;
          }
          context.astCache.set(resolvedId, exprAst);
        }

        if (!exprAst) {
          const errRes: EvaluationResult = {
            ok: false,
            error: 'REF',
            message: `La fórmula de la columna '{${colId}}' tiene errores de sintaxis`,
          };
          context.valueCache.set(cacheKey, errRes);
          return errRes;
        }

        const nextVisited = new Set(context.visitedCols);
        nextVisited.add(resolvedId);

        const subContext: EvaluationContext = {
          ...context,
          depth: context.depth + 1,
          visitedCols: nextVisited,
        };

        const evalRes = evaluateAst(exprAst, markup, subContext);
        context.valueCache.set(cacheKey, evalRes);
        return evalRes;
      }

      // Columnas tipo 'text' o 'choice' no son numéricas
      return {
        ok: false,
        error: 'REF',
        message: `La columna '{${colId}}' es de tipo '${colDef.tipo}' y no es de tipo numérico o fórmula`,
      };
    }

    case 'BinaryOp': {
      const leftRes = evaluateAst(ast.left, markup, { ...context, depth: context.depth + 1 });
      if (!leftRes.ok) return leftRes;

      const rightRes = evaluateAst(ast.right, markup, { ...context, depth: context.depth + 1 });
      if (!rightRes.ok) return rightRes;

      const a = leftRes.value;
      const b = rightRes.value;

      let res: number;
      switch (ast.operator) {
        case '+':
          res = a + b;
          break;
        case '-':
          res = a - b;
          break;
        case '*':
          res = a * b;
          break;
        case '/':
          if (b === 0) {
            return {
              ok: false,
              error: 'DIV0',
              message: 'División por cero',
            };
          }
          res = a / b;
          break;
      }

      if (Number.isNaN(res)) {
        return {
          ok: false,
          error: 'NAN',
          message: 'Resultado no numérico (NaN)',
        };
      }

      if (!Number.isFinite(res)) {
        return {
          ok: false,
          error: 'DIV0',
          message: 'Resultado infinito no permitido',
        };
      }

      if (Math.abs(res) > MAX_MAGNITUDE) {
        return {
          ok: false,
          error: 'OVERFLOW',
          message: 'Resultado excede el límite de magnitud permitido',
        };
      }

      return { ok: true, value: res };
    }

    case 'UnaryOp': {
      const operandRes = evaluateAst(ast.operand, markup, { ...context, depth: context.depth + 1 });
      if (!operandRes.ok) return operandRes;

      const res = ast.operator === '-' ? -operandRes.value : operandRes.value;

      if (!Number.isFinite(res) || Math.abs(res) > MAX_MAGNITUDE) {
        return {
          ok: false,
          error: 'OVERFLOW',
          message: 'Resultado unario excede la magnitud permitida',
        };
      }

      return { ok: true, value: res };
    }

    case 'FunctionCall': {
      const evaluatedArgs: number[] = [];
      for (const arg of ast.args) {
        const argRes = evaluateAst(arg, markup, { ...context, depth: context.depth + 1 });
        if (!argRes.ok) return argRes;
        evaluatedArgs.push(argRes.value);
      }

      let res: number;
      switch (ast.name) {
        case 'abs':
          res = Math.abs(evaluatedArgs[0]);
          break;
        case 'min':
          res = Math.min(...evaluatedArgs);
          break;
        case 'max':
          res = Math.max(...evaluatedArgs);
          break;
        case 'round': {
          const val = evaluatedArgs[0];
          const decimals = evaluatedArgs.length > 1 ? Math.max(0, Math.min(10, Math.floor(evaluatedArgs[1]))) : 0;
          const factor = Math.pow(10, decimals);
          res = Math.round(val * factor) / factor;
          break;
        }
      }

      if (Number.isNaN(res)) {
        return {
          ok: false,
          error: 'NAN',
          message: `La función '${ast.name}' produjo un resultado no numérico (NaN)`,
        };
      }

      if (!Number.isFinite(res) || Math.abs(res) > MAX_MAGNITUDE) {
        return {
          ok: false,
          error: 'OVERFLOW',
          message: `La función '${ast.name}' produjo un valor fuera de los límites permitidos`,
        };
      }

      return { ok: true, value: res };
    }
  }
}

/**
 * Evalúa una columna calculada individual para una marca dada.
 */
export function evaluateColumnForMarkup(
  column: BbxCustomColumn,
  markup: Markup,
  customColumns: BbxCustomColumn[],
  sharedContext?: Partial<EvaluationContext>,
): EvaluationResult {
  if (column.tipo !== 'formula') {
    return {
      ok: false,
      error: 'REF',
      message: `La columna '${column.nombre}' no es de tipo fórmula`,
    };
  }

  const columnsMap = sharedContext?.columnsMap ?? new Map(customColumns.map((c) => [c.id, c]));
  const astCache = sharedContext?.astCache ?? new Map();
  const valueCache = sharedContext?.valueCache ?? new Map();

  const context: EvaluationContext = {
    depth: 0,
    visitedCols: new Set([column.id]),
    columnsMap,
    astCache,
    valueCache,
  };

  let ast = astCache.get(column.id);
  if (ast === undefined) {
    const parseRes = parseExpression(column.expresion ?? '');
    if (parseRes.ok) {
      ast = parseRes.ast;
    } else {
      ast = null;
    }
    astCache.set(column.id, ast);
  }

  if (!ast) {
    return {
      ok: false,
      error: 'REF',
      message: `Error de sintaxis en la expresión de la columna '${column.nombre}'`,
    };
  }

  const result = evaluateAst(ast, markup, context);
  valueCache.set(`${markup.id}:${column.id}`, result);
  return result;
}

/**
 * Matriz de evaluación para todas las marcas y columnas del documento.
 * Retorna Map<markupId, Map<columnId, EvaluationResult>>
 */
export function evaluateDocumentCustomColumns(
  markups: Markup[],
  customColumns: BbxCustomColumn[],
): Map<string, Map<string, EvaluationResult>> {
  const result = new Map<string, Map<string, EvaluationResult>>();
  const columnsMap = new Map(customColumns.map((c) => [c.id, c]));
  const astCache = new Map<string, ExpressionNode | null>();
  const valueCache = new Map<string, EvaluationResult>();

  // Precompilar ASTs de todas las fórmulas
  for (const col of customColumns) {
    if (col.tipo === 'formula') {
      const parseRes = parseExpression(col.expresion ?? '');
      astCache.set(col.id, parseRes.ok ? parseRes.ast : null);
    }
  }

  const formulaColumns = customColumns.filter((c) => c.tipo === 'formula');

  for (const markup of markups) {
    const markupMap = new Map<string, EvaluationResult>();
    for (const col of formulaColumns) {
      const evalRes = evaluateColumnForMarkup(col, markup, customColumns, {
        columnsMap,
        astCache,
        valueCache,
      });
      markupMap.set(col.id, evalRes);
    }
    result.set(markup.id, markupMap);
  }

  return result;
}
