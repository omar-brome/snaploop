import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body?: string;
  confirmLabel?: string;
  destructive?: boolean;
}

// Instagram-style stacked action dialog for destructive confirmations.
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = 'Confirm',
  destructive = true,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} showClose={false} className="max-w-sm text-center">
      <div className="px-6 pb-2 pt-6">
        <h3 className="text-lg font-semibold">{title}</h3>
        {body && <p className="mt-1 text-sm text-muted-light dark:text-muted-dark">{body}</p>}
      </div>
      <div className="mt-4 flex flex-col divide-y divide-border-light dark:divide-border-dark">
        <button
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className={`border-t border-border-light py-3 text-sm font-bold dark:border-border-dark ${destructive ? 'text-red-500' : 'text-primary'}`}
        >
          {confirmLabel}
        </button>
        <button onClick={onClose} className="py-3 text-sm">
          Cancel
        </button>
      </div>
    </Modal>
  );
}
