import React from 'react';
import {
  TextCursorInput,
  SquareCheck,
  CircleDot,
  List,
  SquareChevronDown,
  RectangleHorizontal,
  Signature,
} from 'lucide-react';
import { FieldType } from '../../core/markup/formFields';

/** Ícono de cada tipo de campo de formulario (ADR-0027), como Tools ▸ Form de Revu. */
export function fieldTypeIcon(type: FieldType, size = 16): React.ReactNode {
  switch (type) {
    case 'text':
      return <TextCursorInput size={size} />;
    case 'checkbox':
      return <SquareCheck size={size} />;
    case 'radio':
      return <CircleDot size={size} />;
    case 'listbox':
      return <List size={size} />;
    case 'dropdown':
      return <SquareChevronDown size={size} />;
    case 'button':
      return <RectangleHorizontal size={size} />;
    case 'signature':
      return <Signature size={size} />;
  }
}
