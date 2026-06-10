import { AnimatePresence, motion } from 'framer-motion';
import { useUiStore } from '../../stores/uiStore';

// Bottom toast stack, Instagram-style black pill.
export function Toaster() {
  const toasts = useUiStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-16 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className={`pointer-events-auto rounded-lg px-4 py-2.5 text-sm text-white shadow-lg ${
              t.variant === 'error' ? 'bg-red-600' : 'bg-neutral-800 dark:bg-neutral-700'
            }`}
          >
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
