type ToastListener = (message: string) => void;

const listeners: Set<ToastListener> = new Set();

/**
 * Muestra una notificación accesible de tipo toast en la aplicación.
 */
export function showToast(message: string): void {
  for (const listener of listeners) {
    listener(message);
  }
}

/**
 * Registra un oyente para recibir notificaciones toast.
 * Retorna una función para cancelar la suscripción.
 */
export function registerToastListener(listener: ToastListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
