import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { setBbxErrorHandler } from '../../services/bbxPersistenceService';
import { registerToastListener } from '../../services/toastService';

/** Aviso flotante accesible (role="alert") para todos los mensajes de la aplicación. */
export const ToastHost: React.FC = () => {
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    const unsubToast = registerToastListener((msg) => setToastMessage(msg));
    setBbxErrorHandler((msg) => setToastMessage(msg));
    return () => {
      unsubToast();
      setBbxErrorHandler(null);
    };
  }, []);

  if (!toastMessage) return null;
  return (
    <div
      role="alert"
      className="fixed top-24 right-4 z-50 flex items-center space-x-2 bg-red-900/95 border border-red-500 text-red-50 px-3.5 py-2.5 rounded shadow-2xl text-xs backdrop-blur-sm"
    >
      <AlertTriangle size={15} className="text-red-300 shrink-0" />
      <span className="max-w-sm">{toastMessage}</span>
      <button
        onClick={() => setToastMessage(null)}
        className="p-1 hover:text-white text-red-200 rounded ml-2"
        title="Dismiss"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
};
