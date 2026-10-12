import React from 'react';

/**
 * Íconos propios de REA (ADR-0019/0020): dibujados aquí, sin activos de terceros. Mismo lenguaje que
 * lucide (24×24, trazo `currentColor`) para que convivan en la cinta y los menús.
 */
const Icon: React.FC<{ size?: number; children: React.ReactNode; strokeWidth?: number }> = ({
  size = 18,
  strokeWidth = 1.8,
  children,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

/** Nube de revisión: rectángulo festoneado (arcos hacia fuera en los cuatro lados). */
export const CloudIcon: React.FC<{ size?: number }> = ({ size }) => (
  <Icon size={size}>
    <path d="M5 8a2.33 2.33 0 0 1 4.67 0a2.33 2.33 0 0 1 4.66 0a2.33 2.33 0 0 1 4.67 0a2 2 0 0 1 0 4a2 2 0 0 1 0 4a2.33 2.33 0 0 1 -4.67 0a2.33 2.33 0 0 1 -4.66 0a2.33 2.33 0 0 1 -4.67 0a2 2 0 0 1 0 -4a2 2 0 0 1 0 -4z" />
  </Icon>
);

/** Cloud+: nube con directriz hacia un cuadro de texto. */
export const CloudPlusIcon: React.FC<{ size?: number }> = ({ size }) => (
  <Icon size={size}>
    <path d="M3 13a2 2 0 0 1 4 0a2 2 0 0 1 4 0a1.75 1.75 0 0 1 0 3.5a1.75 1.75 0 0 1 0 3.5a2 2 0 0 1 -4 0a2 2 0 0 1 -4 0a1.75 1.75 0 0 1 0 -3.5a1.75 1.75 0 0 1 0 -3.5z" />
    <path d="M11 13l4.5 -4.5" />
    <rect x="15.5" y="3" width="6.5" height="5.5" rx="0.6" />
    <path d="M17.2 5h3.1M17.2 6.8h2" strokeWidth={1.2} />
  </Icon>
);

/** Cota (Dimension): línea de cota con flechas y líneas de referencia. */
export const DimensionIcon: React.FC<{ size?: number }> = ({ size }) => (
  <Icon size={size}>
    <path d="M3 6v12M21 6v12M4.5 12h15" />
    <path d="M7.5 9.5 4.5 12l3 2.5M16.5 9.5l3 2.5-3 2.5" />
  </Icon>
);

/** Línea simple en diagonal. */
export const LineToolIcon: React.FC<{ size?: number }> = ({ size }) => (
  <Icon size={size}>
    <path d="M4 20 20 4" />
  </Icon>
);

/** Flecha: línea con punta cerrada. */
export const ArrowToolIcon: React.FC<{ size?: number }> = ({ size }) => (
  <Icon size={size}>
    <path d="M4 20 17 7" />
    <path d="M20.5 3.5 18.8 11 13 5.2z" fill="currentColor" />
  </Icon>
);

export const SinglePageIcon: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <Icon size={size}>
    <rect x="6" y="3" width="12" height="18" rx="1" />
  </Icon>
);

export const ContinuousIcon: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <Icon size={size}>
    <rect x="6" y="2" width="12" height="8.5" rx="1" />
    <rect x="6" y="13.5" width="12" height="8.5" rx="1" />
  </Icon>
);

export const FitPageIcon: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <Icon size={size}>
    <path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5" />
    <rect x="8" y="7" width="8" height="10" rx="0.8" />
  </Icon>
);

export const FitWidthIcon: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <Icon size={size}>
    <rect x="7" y="4" width="10" height="16" rx="0.8" />
    <path d="M2 12h3.5M18.5 12H22M3.8 10.2 2 12l1.8 1.8M20.2 10.2 22 12l-1.8 1.8" />
  </Icon>
);

// ── Conjunto estilo Revu (ADR-0023): trazo fino, acentos de color en pluma, marcador y mediciones ──────────

const MEASURE_ACCENT = '#a78bfa';
const HIGHLIGHT_ACCENT = '#facc15';
const PEN_ACCENT = '#3b82f6';

/** Marco de regla punteado (arriba e izquierda) que identifica a las herramientas de medición. */
const MeasureFrame: React.FC<{ size?: number; children: React.ReactNode }> = ({ size, children }) => (
  <Icon size={size} strokeWidth={1.6}>
    <path d="M2.5 2.5H21.5M2.5 2.5V21.5" stroke={MEASURE_ACCENT} strokeWidth={1.6} strokeDasharray="0.1 2.4" />
    {children}
  </Icon>
);

export const LengthMeasureIcon: React.FC<{ size?: number }> = ({ size }) => (
  <MeasureFrame size={size}>
    <path d="M6.5 9.5v7M19.5 9.5v7M7 13h12" />
    <path d="M9.5 11 7 13l2.5 2M17 11l2.5 2-2.5 2" />
  </MeasureFrame>
);

export const PolylengthIcon: React.FC<{ size?: number }> = ({ size }) => (
  <MeasureFrame size={size}>
    <path d="M7 19 9 9l9-1 1 9" />
    <rect x="5.8" y="17.8" width="2.4" height="2.4" fill="currentColor" stroke="none" />
    <rect x="7.8" y="7.8" width="2.4" height="2.4" fill="currentColor" stroke="none" />
    <rect x="16.8" y="6.8" width="2.4" height="2.4" fill="currentColor" stroke="none" />
    <rect x="17.8" y="15.8" width="2.4" height="2.4" fill="currentColor" stroke="none" />
  </MeasureFrame>
);

export const AreaMeasureIcon: React.FC<{ size?: number }> = ({ size }) => (
  <MeasureFrame size={size}>
    <path d="M7 20V8h7l6 6v6z" />
  </MeasureFrame>
);

export const CountMeasureIcon: React.FC<{ size?: number }> = ({ size }) => (
  <MeasureFrame size={size}>
    <path d="M8 8v12M11 8v12M14 8v12M17 8v12M6 18 19 10" />
  </MeasureFrame>
);

export const CalibrateIcon: React.FC<{ size?: number }> = ({ size }) => (
  <MeasureFrame size={size}>
    <path d="m6 18 12-12 2.5 2.5-12 12z" />
    <path d="m10 14 1.5 1.5M12.5 11.5 14 13M15 9l1.5 1.5" />
  </MeasureFrame>
);

/** Cuadro de texto: "A" dentro de un marco. */
export const TextBoxIcon: React.FC<{ size?: number }> = ({ size }) => (
  <Icon size={size} strokeWidth={1.6}>
    <rect x="3" y="3" width="18" height="18" rx="1" />
    <path d="M8 17 12 7l4 10M9.6 13.2h4.8" />
  </Icon>
);

/** Llamada: cuadro de texto con directriz y punta. */
export const CalloutIcon: React.FC<{ size?: number }> = ({ size }) => (
  <Icon size={size} strokeWidth={1.6}>
    <rect x="9" y="3" width="12" height="9" rx="0.8" />
    <path d="M9 9 4 18" />
    <path d="m3.2 20.5.6-4.2 2.6 1.5z" fill="currentColor" />
    <path d="M12 6.5h6M12 9h4" strokeWidth={1.2} />
  </Icon>
);

/** Nota adhesiva con esquina doblada. */
export const NoteIcon: React.FC<{ size?: number }> = ({ size }) => (
  <Icon size={size} strokeWidth={1.6}>
    <path d="M4 4h16v11l-5 5H4z" fill={HIGHLIGHT_ACCENT} fillOpacity={0.25} />
    <path d="M20 15h-5v5" />
    <path d="M8 9h8M8 12.5h5" strokeWidth={1.3} />
  </Icon>
);

/** Marcador (Highlight): rotulador con punta y trazo amarillo. */
export const HighlighterIcon: React.FC<{ size?: number }> = ({ size }) => (
  <Icon size={size} strokeWidth={1.6}>
    <path d="m14.5 3.5 6 6-8 8-6-6z" />
    <path d="m6.5 11.5-2 6 2 2 6-2" />
    <path d="M3 21.5h9" stroke={HIGHLIGHT_ACCENT} strokeWidth={2.4} />
  </Icon>
);

/** Resaltado de texto: líneas de texto con banda amarilla. */
export const TextHighlightIcon: React.FC<{ size?: number }> = ({ size }) => (
  <Icon size={size} strokeWidth={1.6}>
    <rect x="3" y="8.5" width="18" height="7" fill={HIGHLIGHT_ACCENT} fillOpacity={0.45} stroke="none" />
    <path d="M4 5h16M4 12h16M4 19h11" />
  </Icon>
);

/** Pluma (Pen): plumilla azul con trazo libre. */
export const PenIcon: React.FC<{ size?: number }> = ({ size }) => (
  <Icon size={size} strokeWidth={1.6}>
    <path d="m15 4 5 5-9.5 9.5-6 1.5 1.5-6z" stroke={PEN_ACCENT} />
    <path d="m13 6 5 5" stroke={PEN_ACCENT} />
    <path d="M3 21c2-1 4 1 6 0" />
  </Icon>
);

export const UnderlineIcon: React.FC<{ size?: number }> = ({ size }) => (
  <Icon size={size} strokeWidth={1.6}>
    <path d="M7 4v6a5 5 0 0 0 10 0V4M4.5 20h15" />
  </Icon>
);

export const StrikeoutIcon: React.FC<{ size?: number }> = ({ size }) => (
  <Icon size={size} strokeWidth={1.6}>
    <path d="M16 6.5C15 5 13.6 4.5 12 4.5c-2.5 0-4 1.3-4 3 0 1.4 1 2.3 3 3M4 12h16M15.5 14.5c.6.6.9 1.3.9 2 0 1.8-1.8 3-4.4 3-1.8 0-3.4-.6-4.4-1.9" />
  </Icon>
);

export const PolylineToolIcon: React.FC<{ size?: number }> = ({ size }) => (
  <Icon size={size} strokeWidth={1.6}>
    <path d="m4 18 5-9 4 6 4-10 3 6" />
  </Icon>
);

export const RectangleToolIcon: React.FC<{ size?: number }> = ({ size }) => (
  <Icon size={size} strokeWidth={1.6}>
    <rect x="3.5" y="6" width="17" height="12" />
  </Icon>
);

export const EllipseToolIcon: React.FC<{ size?: number }> = ({ size }) => (
  <Icon size={size} strokeWidth={1.6}>
    <ellipse cx="12" cy="12" rx="9" ry="6.5" />
  </Icon>
);

export const PolygonToolIcon: React.FC<{ size?: number }> = ({ size }) => (
  <Icon size={size} strokeWidth={1.6}>
    <path d="M5 20V4l13 5-3 5 4 6z" />
  </Icon>
);

export const ActualSizeIcon: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <Icon size={size}>
    <rect x="5" y="3" width="14" height="18" rx="1" />
    <path d="M9.5 10.5 11 9.5v6M13.5 10.5 15 9.5v6" strokeWidth={1.4} />
  </Icon>
);
