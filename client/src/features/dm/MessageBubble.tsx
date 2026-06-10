import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Reply, Smile, Trash2 } from 'lucide-react';
import type { MediaType } from '../../types';
import { Avatar } from '../../components/ui/Avatar';
import { Spinner } from '../../components/ui/Spinner';
import { cn } from '../../utils/cn';
import { quotePreview } from './helpers';
import type { DmMessage } from './cache';

export const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '🙏', '👍'];

interface MessageBubbleProps {
  message: DmMessage;
  ownId: string;
  isOwn: boolean;
  isGroupChat: boolean;
  isFirstOfGroup: boolean;
  isLastOfGroup: boolean;
  receipt: string | null;
  onReact: (message: DmMessage, emoji: string) => void;
  onReply: (message: DmMessage) => void;
  onUnsend: (message: DmMessage) => void;
  onRetry: (message: DmMessage) => void;
  onOpenMedia: (media: { url: string; type: MediaType }) => void;
}

// Long-press (~450ms) to reveal message actions on touch devices.
function useLongPress(callback: () => void, ms = 450) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };
  useEffect(() => clear, []);
  return {
    onTouchStart: () => {
      clear();
      timerRef.current = setTimeout(callback, ms);
    },
    onTouchEnd: clear,
    onTouchMove: clear,
    onTouchCancel: clear,
  };
}

export function MessageBubble({
  message,
  ownId,
  isOwn,
  isGroupChat,
  isFirstOfGroup,
  isLastOfGroup,
  receipt,
  onReact,
  onReply,
  onUnsend,
  onRetry,
  onOpenMedia,
}: MessageBubbleProps) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const longPress = useLongPress(() => setActionsOpen(true));

  // Long-press/touch actions auto-dismiss.
  useEffect(() => {
    if (!actionsOpen) return;
    const timer = setTimeout(() => {
      setActionsOpen(false);
      setPickerOpen(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, [actionsOpen, pickerOpen]);

  const interactive = !message.isDeleted && !message._status;
  const reactions = Object.entries(message.reactions ?? {}).filter(([, ids]) => ids.length > 0);

  const corners = isOwn
    ? cn(!isFirstOfGroup && 'rounded-tr-md', !isLastOfGroup && 'rounded-br-md')
    : cn(!isFirstOfGroup && 'rounded-tl-md', !isLastOfGroup && 'rounded-bl-md');
  const bubbleBase = cn('rounded-3xl px-4 py-2 text-sm', corners);

  const body = (() => {
    if (message.isDeleted) {
      return (
        <span
          className={cn(
            bubbleBase,
            'border border-border-light italic text-muted-light dark:border-border-dark dark:text-muted-dark'
          )}
        >
          Message unsent
        </span>
      );
    }

    switch (message.type) {
      case 'IMAGE':
      case 'VIDEO': {
        if (!message.mediaUrl) return null;
        const type: MediaType = message.type === 'VIDEO' ? 'VIDEO' : 'IMAGE';
        return (
          <button
            onClick={() => onOpenMedia({ url: message.mediaUrl!, type })}
            aria-label={type === 'VIDEO' ? 'View video' : 'View photo'}
            className={cn(
              'relative block max-w-[240px] overflow-hidden rounded-2xl bg-neutral-100 dark:bg-neutral-900',
              corners
            )}
          >
            {type === 'IMAGE' ? (
              <img src={message.mediaUrl} alt="" className="max-h-72 w-full object-cover" />
            ) : (
              <>
                <video
                  src={message.mediaUrl}
                  muted
                  playsInline
                  preload="metadata"
                  className="pointer-events-none max-h-72 w-full object-cover"
                />
                <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
                  <span className="rounded-full bg-black/50 p-2.5 text-white">
                    <Play size={20} fill="currentColor" />
                  </span>
                </span>
              </>
            )}
          </button>
        );
      }

      case 'SHARED_POST': {
        const post = message.sharedPost;
        if (!post) return null;
        const cover = post.media[0];
        const coverSrc = cover ? (cover.thumbnailUrl ?? cover.mediaUrl) : null;
        return (
          <Link
            to={`/p/${post.id}`}
            className="block w-60 overflow-hidden rounded-2xl border border-border-light dark:border-border-dark"
            aria-label={`Shared post by ${post.user.username}`}
          >
            <span className="flex items-center gap-2 px-3 py-2">
              <Avatar src={post.user.avatarUrl} alt={post.user.username} size={24} />
              <span className="truncate text-sm font-semibold">{post.user.username}</span>
            </span>
            {coverSrc ? (
              cover?.mediaType === 'VIDEO' && !cover.thumbnailUrl ? (
                <video
                  src={cover.mediaUrl}
                  muted
                  playsInline
                  preload="metadata"
                  className="pointer-events-none aspect-square w-full object-cover"
                />
              ) : (
                <img src={coverSrc} alt="" className="aspect-square w-full object-cover" />
              )
            ) : (
              <span className="block aspect-square w-full bg-neutral-100 dark:bg-neutral-900" />
            )}
          </Link>
        );
      }

      case 'SHARED_REEL': {
        const reel = message.sharedReel;
        if (!reel) return null;
        return (
          <Link
            to={`/reels/${reel.id}`}
            className="relative block w-44 overflow-hidden rounded-2xl border border-border-light dark:border-border-dark"
            aria-label={`Shared reel by ${reel.user.username}`}
          >
            {reel.thumbnailUrl ? (
              <img src={reel.thumbnailUrl} alt="" className="aspect-[9/16] w-full object-cover" />
            ) : (
              <span className="block aspect-[9/16] w-full bg-neutral-100 dark:bg-neutral-900" />
            )}
            <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
              <span className="rounded-full bg-black/50 p-2 text-white">
                <Play size={18} fill="currentColor" />
              </span>
            </span>
            <span className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-2.5 py-2">
              <Avatar src={reel.user.avatarUrl} alt={reel.user.username} size={20} />
              <span className="truncate text-xs font-semibold text-white">
                {reel.user.username}
              </span>
            </span>
          </Link>
        );
      }

      case 'STORY_REPLY':
        return (
          <span className="flex flex-col gap-1">
            <span className={cn('px-1 text-[11px] text-muted-light dark:text-muted-dark', isOwn && 'text-right')}>
              {isOwn ? 'You reacted to a story' : 'Reacted to your story'}
            </span>
            {message.content && (
              <span
                className={cn(
                  bubbleBase,
                  'whitespace-pre-wrap break-words',
                  isOwn
                    ? 'self-end bg-primary text-white'
                    : 'self-start bg-neutral-100 dark:bg-neutral-800'
                )}
              >
                {message.content}
              </span>
            )}
          </span>
        );

      default:
        return (
          <span
            className={cn(
              bubbleBase,
              'whitespace-pre-wrap break-words',
              isOwn ? 'bg-primary text-white' : 'bg-neutral-100 dark:bg-neutral-800'
            )}
          >
            {message.content}
          </span>
        );
    }
  })();

  return (
    <div
      className={cn('group relative flex w-full items-end gap-2', isOwn && 'flex-row-reverse')}
      onMouseLeave={() => {
        setPickerOpen(false);
        setActionsOpen(false);
      }}
    >
      {!isOwn &&
        (isLastOfGroup ? (
          <Avatar src={message.sender.avatarUrl} alt={message.sender.username} size={28} />
        ) : (
          <span className="w-7 shrink-0" aria-hidden />
        ))}

      <div className={cn('flex min-w-0 max-w-[75%] flex-col', isOwn ? 'items-end' : 'items-start')}>
        {isGroupChat && !isOwn && isFirstOfGroup && (
          <span className="mb-0.5 px-3 text-[11px] text-muted-light dark:text-muted-dark">
            {message.sender.username}
          </span>
        )}

        {message.replyTo && !message.isDeleted && (
          <span
            className={cn(
              'mb-1 max-w-full truncate rounded-xl border-l-2 border-neutral-300 bg-neutral-50 px-3 py-1.5 text-xs text-muted-light',
              'dark:border-neutral-600 dark:bg-neutral-900 dark:text-muted-dark'
            )}
          >
            <span className="font-semibold">
              {message.replyTo.sender.id === ownId ? 'You' : message.replyTo.sender.username}
            </span>
            {' · '}
            {quotePreview(message.replyTo)}
          </span>
        )}

        <span {...(interactive ? longPress : {})} className="max-w-full">
          {body}
        </span>

        {reactions.length > 0 && (
          <span className={cn('z-[1] -mt-1.5 flex gap-1', isOwn ? 'mr-2' : 'ml-2')}>
            {reactions.map(([emoji, ids]) => (
              <button
                key={emoji}
                onClick={() => interactive && onReact(message, emoji)}
                aria-label={`${emoji} ${ids.length}, ${ids.includes(ownId) ? 'remove your reaction' : 'react'}`}
                className={cn(
                  'flex items-center gap-0.5 rounded-full border bg-white px-1.5 py-0.5 text-xs shadow-sm dark:bg-neutral-800',
                  ids.includes(ownId)
                    ? 'border-primary'
                    : 'border-border-light dark:border-border-dark'
                )}
              >
                {emoji}
                {ids.length > 1 && <span className="font-semibold">{ids.length}</span>}
              </button>
            ))}
          </span>
        )}

        {message._status === 'failed' && (
          <button
            onClick={() => onRetry(message)}
            className="mt-1 text-[11px] font-semibold text-red-500"
          >
            Not delivered. Tap to retry.
          </button>
        )}

        {receipt && (
          <span className="mt-1 text-[11px] text-muted-light dark:text-muted-dark">{receipt}</span>
        )}
      </div>

      {message._status === 'sending' && (
        <Spinner size={12} className="mb-2 shrink-0 text-neutral-400" />
      )}

      {interactive && (
        <div
          className={cn(
            'relative mb-1 shrink-0 items-center gap-0.5 text-muted-light dark:text-muted-dark',
            actionsOpen || pickerOpen ? 'flex' : 'hidden group-hover:flex'
          )}
        >
          {pickerOpen && (
            <div
              role="menu"
              aria-label="React"
              className={cn(
                'absolute bottom-full z-20 mb-1.5 flex gap-0.5 rounded-full border border-border-light bg-white p-1 shadow-lg dark:border-border-dark dark:bg-neutral-800',
                isOwn ? 'right-0' : 'left-0'
              )}
            >
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  role="menuitem"
                  onClick={() => {
                    onReact(message, emoji);
                    setPickerOpen(false);
                  }}
                  aria-label={`React with ${emoji}`}
                  className="rounded-full p-1 text-lg transition-transform hover:scale-125"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setPickerOpen((v) => !v)}
            aria-label="React to message"
            className="rounded-full p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <Smile size={16} />
          </button>
          <button
            onClick={() => onReply(message)}
            aria-label="Reply to message"
            className="rounded-full p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <Reply size={16} />
          </button>
          {isOwn && (
            <button
              onClick={() => onUnsend(message)}
              aria-label="Unsend message"
              className="rounded-full p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
