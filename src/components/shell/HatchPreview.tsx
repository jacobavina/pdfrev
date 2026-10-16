import React from 'react';
import { HATCH_PATTERNS, HatchId, hatchStrokes } from '../../core/markup/hatch';
import type { IconPickerOption } from './IconPicker';

export type HatchOption = HatchId | 'none';

/** Opciones del menú Hatch (ADR-0057), en el orden de Revu: "(None)" y los patrones. */
export const HATCH_OPTIONS: IconPickerOption<HatchOption>[] = [
  { value: 'none', label: '(None)' },
  ...HATCH_PATTERNS.map((p, i) => ({ value: p.id as HatchOption, label: p.label, divider: i === 0 })),
];

const W = 34;
const H = 16;

/** Muestra de un patrón de hatch en un recuadro, con la misma geometría que la marca dibujada. */
export const HatchPreview: React.FC<{ id: HatchOption }> = ({ id }) => {
  if (id === 'none') {
    return (
      <svg width={W} height={H} aria-hidden="true" data-hatch="none">
        <rect x={0.5} y={0.5} width={W - 1} height={H - 1} fill="none" stroke="currentColor" strokeOpacity={0.35} />
      </svg>
    );
  }
  const clipId = `rea-hatch-preview-${id}`;
  return (
    <svg width={W} height={H} aria-hidden="true" data-hatch={id}>
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={W} height={H} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {hatchStrokes({ x: 0, y: 0, width: W, height: H }, id, 0.55).map((st, i) => (
          <path
            key={i}
            d={st.d}
            fill="none"
            stroke="currentColor"
            strokeWidth={st.dash ? st.width : 0.9}
            strokeDasharray={st.dash ? st.dash.map((v) => v.toFixed(2)).join(' ') : undefined}
          />
        ))}
      </g>
      <rect x={0.5} y={0.5} width={W - 1} height={H - 1} fill="none" stroke="currentColor" strokeOpacity={0.35} />
    </svg>
  );
};
