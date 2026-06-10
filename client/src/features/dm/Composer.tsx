import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Heart, Image as ImageIcon, Smile, X } from 'lucide-react';
import type { Message } from '../../types';
import { getSocket } from '../../services/socket';
import { cn } from '../../utils/cn';
import { quotePreview } from './helpers';
import type { MessageDraft } from './hooks';

const COMPOSER_EMOJIS = [
  '😀', '😂', '🥹', '😍', '😘', '🥰', '😎', '🤩',
  '🤔', '🙄', '😴', '😅', '😭', '😢', '😮', '😡',
  '👍', '🙏', '👏', '🔥', '🎉', '💯', '✨', '❤️',
];

// Throttled typing signal: at most one `isTyping: true` every 2s while the
// user types, an automatic stop after 2.5s of idle, and an explicit stop on
// send / conversation change / unmount.
function useTypingEmitter(conversationId: string) {
  const activeRef = useRef(false);
  const lastEmitRef = useRef(0);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const emit = useCallback(
    (isTyping: boolean) => {
      getSocket()?.emit('typing', { conversationId, isTyping });
    },
    [conversationId]
  );

  const stop = useCallback(() => {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    stopTimerRef.current = null;
    if (activeRef.current) {
      activeRef.current = false;
      lastEmitRef.current = 0;
      emit(false);
    }
  }, [emit]);

  const onType = useCallback(() => {
    const now = Date.now();
    if (!activeRef.current || now - lastEmitRef.current > 2000) {
      activeRef.current = true;
      lastEmitRef.current = now;
      emit(true);
    }
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    stopTimerRef.current = setTimeout(stop, 2500);
  }, [emit, stop]);

  // Clear the typing state when switching threads or unmounting.
  useEffect(() => stop, [stop]);

  return { onType, stop };
}

interface ComposerProps {
  conversationId: string;
  replyTo: NonNullable<Message['replyTo']> | null;
  onCancelReply: () => void;
  onSend: (draft: MessageDraft) => void;
}

// Sticky message input: text with Enter-to-send, emoji popover, image/video
// attach (sent immediately as optimistic media messages), reply banner, and
// a quick ❤️ when the field is empty.
export function Composer({ conversationId, replyTo, onCancelReply, onSend }: ComposerProps) {
  const [text, setText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { onType, stop } = useTypingEmitter(conversationId);

  useEffect(() => {
    if (replyTo) textRef.current?.focus();
  }, [replyTo]);

  const resize = () => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const sendText = (content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    onSend({ type: 'TEXT', content: trimmed, replyTo: replyTo ?? undefined });
    setText('');
    stop();
    setEmojiOpen(false);
    requestAnimationFrame(resize);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendText(text);
    }
  };

  const onPickFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    Array.from(list).forEach((file, index) => {
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) return;
      onSend({
        type: file.type.startsWith('video/') ? 'VIDEO' : 'IMAGE',
        file,
        previewUrl: URL.createObjectURL(file),
        replyTo: index === 0 ? (replyTo ?? undefined) : undefined,
      });
    });
    stop();
    if (fileRef.current) fileRef.current.value = '';
  };

  const hasText = text.trim().length > 0;

  return (
    <div className="shrink-0 px-4 pb-3 pt-1">
      {replyTo && (
        <div className="mb-1 flex items-center justify-between gap-2 rounded-t-xl border-l-2 border-primary bg-neutral-50 px-3 py-2 dark:bg-neutral-900">
          <p className="min-w-0 truncate text-xs text-muted-light dark:text-muted-dark">
            Replying to <span className="font-semibold">{replyTo.sender.username}</span>
            {' · '}
            {quotePreview(replyTo)}
          </p>
          <button
            onClick={onCancelReply}
            aria-label="Cancel reply"
            className="shrink-0 rounded-full p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="relative flex items-end gap-1 rounded-3xl border border-border-light px-2 py-1.5 dark:border-border-dark">
        {emojiOpen && (
          <div
            role="menu"
            aria-label="Emoji"
            className="absolute bottom-full left-0 z-20 mb-2 grid w-64 grid-cols-8 gap-0.5 rounded-2xl border border-border-light bg-white p-2 shadow-lg dark:border-border-dark dark:bg-neutral-800"
          >
            {COMPOSER_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                role="menuitem"
                onClick={() => {
                  setText((t) => `${t}${emoji}`);
                  onType();
                  textRef.current?.focus();
                }}
                aria-label={`Insert ${emoji}`}
                className="rounded-lg p-1 text-lg transition-transform hover:scale-125"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <button
          onClick={() => setEmojiOpen((v) => !v)}
          aria-label="Choose an emoji"
          aria-expanded={emojiOpen}
          className="shrink-0 rounded-full p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <Smile size={22} />
        </button>

        <textarea
          ref={textRef}
          rows={1}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onType();
            resize();
          }}
          onKeyDown={onKeyDown}
          onBlur={stop}
          placeholder="Message…"
          aria-label="Message"
          className="max-h-[120px] flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-neutral-400"
        />

        {hasText ? (
          <button
            onClick={() => sendText(text)}
            className="shrink-0 px-2 py-1.5 text-sm font-semibold text-primary hover:text-primary-hover"
          >
            Send
          </button>
        ) : (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="sr-only"
              aria-hidden
              tabIndex={-1}
              onChange={(e) => onPickFiles(e.target.files)}
            />
            <button
              onClick={() => fileRef.current?.click()}
              aria-label="Attach a photo or video"
              className="shrink-0 rounded-full p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <ImageIcon size={22} />
            </button>
            <button
              onClick={() => sendText('❤️')}
              aria-label="Send a heart"
              className={cn(
                'shrink-0 rounded-full p-1.5 text-like hover:bg-neutral-100 dark:hover:bg-neutral-800'
              )}
            >
              <Heart size={22} fill="currentColor" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
