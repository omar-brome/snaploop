import { ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../../utils/cn';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  // 'sheet' slides from the bottom on mobile (comments, options menus).
  variant?: 'center' | 'sheet';
  className?: string;
  showClose?: boolean;
}

export function Modal({ open, onClose, children, title, variant = 'center', className, showClose = true }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className={cn(
            'fixed inset-0 z-50 flex bg-black/60',
            variant === 'sheet' ? 'items-end justify-center sm:items-center' : 'items-center justify-center'
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <motion.div
            initial={variant === 'sheet' ? { y: '100%' } : { scale: 0.95, opacity: 0 }}
            animate={variant === 'sheet' ? { y: 0 } : { scale: 1, opacity: 1 }}
            exit={variant === 'sheet' ? { y: '100%' } : { scale: 0.95, opacity: 0 }}
            transition={{ type: 'tween', duration: 0.2 }}
            className={cn(
              'relative max-h-[90vh] w-full overflow-y-auto bg-white dark:bg-neutral-900',
              variant === 'sheet'
                ? 'rounded-t-2xl sm:max-w-lg sm:rounded-2xl'
                : 'mx-4 max-w-md rounded-2xl',
              className
            )}
          >
            {(title || showClose) && (
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border-light bg-white px-4 py-3 dark:border-border-dark dark:bg-neutral-900">
                <h2 className="text-base font-semibold">{title}</h2>
                {showClose && (
                  <button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                    <X size={20} />
                  </button>
                )}
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
