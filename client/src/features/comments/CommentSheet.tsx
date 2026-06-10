import { Modal } from '../../components/ui/Modal';
import { CommentSection } from './CommentSection';
import type { CommentTargetType } from './api';

interface CommentSheetProps {
  open: boolean;
  onClose: () => void;
  targetType: CommentTargetType;
  targetId: string;
  ownerId: string;
  commentsOff?: boolean;
}

// Bottom-sheet wrapper around CommentSection (feed cards, reels rail).
export function CommentSheet({
  open,
  onClose,
  targetType,
  targetId,
  ownerId,
  commentsOff,
}: CommentSheetProps) {
  return (
    <Modal open={open} onClose={onClose} title="Comments" variant="sheet" className="sm:max-w-md">
      <div className="flex h-[70vh] flex-col sm:h-[60vh]">
        <CommentSection
          targetType={targetType}
          targetId={targetId}
          ownerId={ownerId}
          commentsOff={commentsOff}
        />
      </div>
    </Modal>
  );
}
