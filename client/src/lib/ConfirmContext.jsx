import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, AlertCircle, HelpCircle, X } from 'lucide-react';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: '',
    cancelLabel: '',
    variant: 'danger', // 'danger' | 'warning' | 'primary'
    resolve: null,
  });

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      const opts = typeof options === 'string' ? { message: options } : (options || {});
      setDialog({
        isOpen: true,
        title: opts.title || '',
        message: opts.message || '',
        confirmLabel: opts.confirmLabel || '',
        cancelLabel: opts.cancelLabel || '',
        variant: opts.variant || 'danger',
        resolve,
      });
    });
  }, []);

  const handleClose = useCallback((value) => {
    if (dialog.resolve) {
      dialog.resolve(value);
    }
    setDialog((prev) => ({ ...prev, isOpen: false, resolve: null }));
  }, [dialog]);

  // Handle ESC key
  useEffect(() => {
    function handleKeyDown(e) {
      if (dialog.isOpen && e.key === 'Escape') {
        handleClose(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialog.isOpen, handleClose]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog.isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => handleClose(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                    dialog.variant === 'danger'
                      ? 'bg-danger-tint text-danger'
                      : dialog.variant === 'warning'
                      ? 'bg-amber-500/10 text-amber-600'
                      : 'bg-mark-tint text-mark'
                  }`}
                >
                  {dialog.variant === 'danger' ? (
                    <AlertTriangle size={22} />
                  ) : dialog.variant === 'warning' ? (
                    <AlertCircle size={22} />
                  ) : (
                    <HelpCircle size={22} />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold text-ink">
                    {dialog.title || t('common.confirmTitle', 'Confirmation')}
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleClose(false)}
                className="rounded-lg p-1 text-ink-soft hover:bg-paper hover:text-ink transition"
                aria-label={t('common.cancel', 'Cancel')}
              >
                <X size={18} />
              </button>
            </div>

            <p className="mt-3 text-sm text-ink-soft leading-relaxed">
              {dialog.message}
            </p>

            <div className="mt-6 flex items-center justify-end gap-2.5 pt-3 border-t border-line/60">
              <button
                type="button"
                autoFocus
                onClick={() => handleClose(false)}
                className="btn-quiet text-xs font-semibold px-4 py-2"
              >
                {dialog.cancelLabel || t('common.cancel', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={() => handleClose(true)}
                className={`text-xs font-semibold px-4 py-2 ${
                  dialog.variant === 'danger'
                    ? 'btn-danger'
                    : 'btn-primary'
                }`}
              >
                {dialog.confirmLabel || t('common.confirm', 'Confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context;
}
