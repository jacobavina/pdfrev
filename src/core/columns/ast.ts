/**
 * Definiciones de AST, tipos y constantes para el parser y evaluador
 * de columnas personalizadas calculadas con gramática cerrada.
 */

export const WHITELISTED_MARKUP_FIELDS = [
  'strokeWidth',
  'opacity',
  'pageIndex',
] as const;

export type WhitelistedField = (typeof WHITELISTED_MARKUP_FIELDS)[number];

export const WHITELISTED_FUNCTIONS = [
  'round',
  'min',
  'max',
  'abs',
] as const;

export type WhitelistedFunction = (typeof WHITELISTED_FUNCTIONS)[number];

export const COLUMN_ERROR_CODES = [
  'DIV0',
  'NAN',
  'OVERFLOW',
  'REF',
  'CYCLE',
  'DEPTH',
] as const;

export type ColumnErrorCode = (typeof COLUMN_ERROR_CODES)[number];

export const MAX_EXPRESSION_LENGTH = 500;
export const MAX_AST_DEPTH = 20;
export const MAX_FUNCTION_CALLS = 64;
export const MAX_TOKENS = 300;
export const MAX_MAGNITUDE = 1e15;

export interface NumberLiteralNode {
  type: 'NumberLiteral';
  value: number;
}

export interface FieldReferenceNode {
  type: 'FieldReference';
  field: WhitelistedField;
}

export interface ColumnReferenceNode {
  type: 'ColumnReference';
  columnId: string;
}

export interface BinaryOpNode {
  type: 'BinaryOp';
  operator: '+' | '-' | '*' | '/';
  left: ExpressionNode;
  right: ExpressionNode;
}

export interface UnaryOpNode {
  type: 'UnaryOp';
  operator: '+' | '-';
  operand: ExpressionNode;
}

export interface FunctionCallNode {
  type: 'FunctionCall';
  name: WhitelistedFunction;
  args: ExpressionNode[];
}

export type ExpressionNode =
  | NumberLiteralNode
  | FieldReferenceNode
  | ColumnReferenceNode
  | BinaryOpNode
  | UnaryOpNode
  | FunctionCallNode;

export type TokenType =
  | 'NUMBER'
  | 'FIELD_REF'
  | 'COL_REF'
  | 'PLUS'
  | 'MINUS'
  | 'STAR'
  | 'SLASH'
  | 'LPAREN'
  | 'RPAREN'
  | 'COMMA'
  | 'FUNCTION'
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  position: number;
}

export type ParseResult =
  | { ok: true; ast: ExpressionNode }
  | { ok: false; code: string; message: string; position: number };

export type EvaluationResult =
  | { ok: true; value: number }
  | { ok: false; error: ColumnErrorCode; message: string };
