import * as React from 'react';
import { cn } from '@/lib/utils';

export interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: 'default' | 'destructive' | 'success';
  duration?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  toast: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const toast = React.useCallback((newToast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    const toastWithId = { ...newToast, id };
    setToasts((prev) => [...prev, toastWithId]);

    const duration = newToast.duration ?? 5000;
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      {children}
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

function ToastContainer({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: string) => void }) {
  return (
    <div className="fixed bottom-0 right-0 z-[100] flex flex-col-reverse gap-2 p-4 max-w-sm w-full">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const variantStyles = {
    default: 'bg-background border-border',
    destructive: 'bg-destructive text-destructive-foreground border-destructive',
    success: 'bg-green-600 text-white border-green-700',
  };

  // Description text should be visible on colored backgrounds
  const descriptionStyles = {
    default: 'text-muted-foreground',
    destructive: 'text-destructive-foreground/90',
    success: 'text-white/90',
  };

  // Close button styles
  const closeButtonStyles = {
    default: 'text-muted-foreground hover:text-foreground',
    destructive: 'text-destructive-foreground hover:text-destructive-foreground/80',
    success: 'text-white/70 hover:text-white',
  };

  const variant = toast.variant || 'default';

  return (
    <div
      className={cn(
        'rounded-lg border p-4 shadow-lg transition-all',
        variantStyles[variant]
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          {toast.title && <div className="font-semibold">{toast.title}</div>}
          {toast.description && (
            <div className={cn('text-sm', descriptionStyles[variant])}>
              {toast.description}
            </div>
          )}
        </div>
        <button
          onClick={onDismiss}
          className={closeButtonStyles[variant]}
        >
          ×
        </button>
      </div>
    </div>
  );
}


