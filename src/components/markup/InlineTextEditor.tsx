import React, { useState, useEffect, useRef } from 'react';
import { ViewportTransform, MarkupPoint } from '../../types/markup';
import { normalizedToScreen } from '../../utils/coordinates';

interface InlineTextEditorProps {
  initialText: string;
  position: MarkupPoint;
  transform: ViewportTransform;
  onCommit: (newText: string) => void;
  onCancel: () => void;
}

export const InlineTextEditor: React.FC<InlineTextEditorProps> = ({
  initialText,
  position,
  transform,
  onCommit,
  onCancel,
}) => {
  const [text, setText] = useState(initialText);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const screenPos = normalizedToScreen(position, transform);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onCommit(text);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div
      className="absolute z-50 pointer-events-auto shadow-xl rounded border border-blue-500 bg-white"
      style={{
        left: `${screenPos.x}px`,
        top: `${screenPos.y}px`,
        minWidth: '160px',
      }}
    >
      <textarea
        ref={textareaRef}
        value={text}
        data-testid="inline-text-editor-input"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => onCommit(text)}
        rows={2}
        className="w-full h-full p-1.5 text-xs text-gray-900 font-sans outline-none resize-none bg-yellow-50 rounded"
        placeholder="Escriba una nota técnica..."
      />
      <div className="flex justify-between items-center px-1.5 py-0.5 bg-gray-100 text-[10px] text-gray-500 border-t border-gray-200">
        <span>Enter: guardar | Esc: cancelar</span>
      </div>
    </div>
  );
};
