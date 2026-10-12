import React, { useState, useEffect, useRef } from 'react';
import {
  ViewportTransform,
  MarkupPoint,
  STICKY_NOTE_COLORS,
  StickyNoteColorPreset,
} from '../../types/markup';
import { normalizedToScreen } from '../../utils/coordinates';

export interface InlineTextEditorProps {
  initialText: string;
  position: MarkupPoint;
  transform: ViewportTransform;
  colorPresets?: boolean;
  initialColor?: string;
  onCommit: (newText: string, color?: StickyNoteColorPreset) => void;
  onCancel: () => void;
}

export const InlineTextEditor: React.FC<InlineTextEditorProps> = ({
  initialText,
  position,
  transform,
  colorPresets,
  initialColor,
  onCommit,
  onCancel,
}) => {
  const [text, setText] = useState(initialText);
  const isCancelledRef = useRef(false);

  // Determinar preset inicial de color
  const presetsList = Object.values(STICKY_NOTE_COLORS);
  const initialPreset =
    presetsList.find((p) => p.fillColor.toLowerCase() === (initialColor || '').toLowerCase()) ||
    STICKY_NOTE_COLORS.yellow;
  const [selectedColor, setSelectedColor] = useState<StickyNoteColorPreset>(initialPreset);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const screenPos = normalizedToScreen(position, transform);
  const popupLeft = colorPresets ? screenPos.x + 28 * transform.scale : screenPos.x;

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      isCancelledRef.current = true;
      onCommit(text, selectedColor);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      isCancelledRef.current = true;
      onCancel();
    }
  };

  const handleBlur = () => {
    if (isCancelledRef.current) return;
    // Si la nota está vacía y pierde foco sin presionar Enter, no crear marca fantasma
    if (colorPresets && !text.trim()) {
      onCancel();
      return;
    }
    onCommit(text, selectedColor);
  };

  return (
    <div
      data-testid={colorPresets ? 'sticky-note-popup' : 'inline-text-editor'}
      className="absolute z-50 pointer-events-auto shadow-xl rounded border border-blue-500 bg-white p-1"
      style={{
        left: `${popupLeft}px`,
        top: `${screenPos.y}px`,
        minWidth: '180px',
      }}
    >
      {colorPresets && (
        <div className="flex items-center justify-between gap-1 pb-1 mb-1 border-b border-gray-200">
          <div className="flex items-center gap-1.5" data-testid="sticky-color-presets">
            {presetsList.map((preset) => {
              const isSelected = selectedColor.name === preset.name;
              return (
                <button
                  key={preset.name}
                  type="button"
                  data-testid={`sticky-color-${preset.name}`}
                  title={preset.label}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setSelectedColor(preset)}
                  className={`w-5 h-5 rounded-full border transition-transform ${
                    isSelected
                      ? 'ring-2 ring-blue-500 scale-110 border-gray-600'
                      : 'border-gray-300 hover:scale-105'
                  }`}
                  style={{ backgroundColor: preset.fillColor }}
                />
              );
            })}
          </div>
          <button
            type="button"
            data-testid="sticky-cancel-btn"
            title="Cancel (Escape)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              isCancelledRef.current = true;
              onCancel();
            }}
            className="text-xs text-gray-400 hover:text-gray-700 px-1"
          >
            ✕
          </button>
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={text}
        data-testid="inline-text-editor-input"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        rows={2}
        className="w-full h-full p-1.5 text-xs text-gray-900 font-sans outline-none resize-none rounded transition-colors"
        style={{
          backgroundColor: colorPresets ? selectedColor.fillColor : '#fefce8',
        }}
        placeholder={colorPresets ? 'Type a note...' : 'Type a comment...'}
      />
      <div className="flex justify-between items-center px-1 py-0.5 bg-gray-50 text-[10px] text-gray-500 rounded mt-0.5">
        <span>Enter: save | Esc: cancel</span>
      </div>
    </div>
  );
};
