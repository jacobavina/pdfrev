import React from 'react';

/** Marco común de los paneles del dock izquierdo: cabecera con el título y cuerpo con desplazamiento. */
export const PanelShell: React.FC<{ title: string; testId: string; children: React.ReactNode }> = ({ title, testId, children }) => (
  <aside data-testid={testId} className="w-60 bg-cad-panel border-r border-cad-border flex flex-col select-none min-h-0 text-xs">
    <div className="panel-header">
      <span className="ui-panel-title">{title}</span>
    </div>
    <div className="flex-1 overflow-y-auto text-xs text-gray-200">{children}</div>
  </aside>
);
