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
