import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { toast } from '../../stores/uiStore';
import { Modal } from '../../components/ui/Modal';
import { reelLink, reelsApi } from './api';

const REPORT_REASONS = [
  'Spam',
  "I just don't like it",
  'Nudity or sexual activity',
  'Hate speech or symbols',
  'Violence or dangerous organizations',
  'Scam or fraud',
  'False information',
] as const;

interface MoreSheetProps {
  reelId: string;
  open: boolean;
  onClose: () => void;
}

// Options sheet (MoreHorizontal): report flow + copy link.
export function MoreSheet({ reelId, open, onClose }: MoreSheetProps) {
  const [view, setView] = useState<'menu' | 'report'>('menu');

  const report = useMutation({
    mutationFn: (reason: string) => reelsApi.report(reelId, reason),
    onSuccess: () => {
      toast('Thanks for reporting this reel');
      handleClose();
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Could not submit report', 'error'),
  });

  const handleClose = () => {
    onClose();
    setView('menu');
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(reelLink(reelId));
      toast('Link copied');
    } catch {
      toast('Could not copy link', 'error');
    }
    handleClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      variant="sheet"
      title={view === 'report' ? 'Report' : 'Options'}
      showClose
    >
      {view === 'menu' ? (
        <div className="flex flex-col py-1">
          <button
            type="button"
            onClick={() => setView('report')}
            className="px-4 py-3.5 text-left text-sm font-bold text-red-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            Report
          </button>
          <button
            type="button"
            onClick={copyLink}
            className="px-4 py-3.5 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            Copy link
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-3.5 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-col py-1">
          <button
            type="button"
            onClick={() => setView('menu')}
            className="flex items-center gap-1.5 px-4 py-2 text-left text-xs font-medium text-muted-light hover:underline dark:text-muted-dark"
            aria-label="Back to options"
          >
            <ChevronLeft size={14} /> Back
          </button>
          <p className="px-4 pb-2 text-sm font-semibold">Why are you reporting this reel?</p>
          {REPORT_REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              disabled={report.isPending}
              onClick={() => report.mutate(reason)}
              className="px-4 py-3 text-left text-sm hover:bg-neutral-100 disabled:opacity-50 dark:hover:bg-neutral-800"
            >
              {reason}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
