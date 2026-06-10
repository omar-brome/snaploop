import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Info } from 'lucide-react';
import type { Conversation, MediaType, Message } from '../../types';
import { useAuthStore } from '../../stores/authStore';
import { toast } from '../../stores/uiStore';
import { Avatar } from '../../components/ui/Avatar';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { Spinner } from '../../components/ui/Spinner';
import { cn } from '../../utils/cn';
import { dmApi } from './api';
import { patchMessage, type DmMessage } from './cache';
import { ConversationAvatar } from './ConversationAvatar';
import { Composer } from './Composer';
import { GroupInfoSheet } from './GroupInfoSheet';
import { activityLabel, conversationName, otherParticipants, seenLabel } from './helpers';
import { useConversation, useEndReached, useMessages, useSendMessage, type MessageDraft } from './hooks';
import { MessageBubble } from './MessageBubble';
import { useThreadPresence, useTypingUsers, type TypingUser } from './realtime';

// Consecutive same-sender messages within 5 minutes render as one visual group.
const GROUP_GAP_MS = 5 * 60 * 1000;
// A timestamp separator appears when more than 45 minutes pass between messages.
const SEPARATOR_GAP_MS = 45 * 60 * 1000;

function sameGroup(a: DmMessage, b: DmMessage): boolean {
  return (
    a.sender.id === b.sender.id &&
    Math.abs(new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) < GROUP_GAP_MS
  );
}

function separatorLabel(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (date.toDateString() === now.toDateString()) return time;
  const days = (now.getTime() - date.getTime()) / 86_400_000;
  if (days < 6) return `${date.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
  return `${date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  })}, ${time}`;
}

// Right-hand thread pane: header, column-reverse message list with upward
// infinite scroll, typing indicator, seen receipts and the composer.
export function MessageThread({ conversationId }: { conversationId: string }) {
  const queryClient = useQueryClient();
  const ownId = useAuthStore((s) => s.user?.id) ?? '';
  const { data: conversation } = useConversation(conversationId);
  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useMessages(conversationId);
  const typingUsers = useTypingUsers(conversationId);
  const { send, retry } = useSendMessage(conversationId);
  useThreadPresence(conversationId);

  const [replyTo, setReplyTo] = useState<NonNullable<Message['replyTo']> | null>(null);
  const [unsendTarget, setUnsendTarget] = useState<DmMessage | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; type: MediaType } | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  const sentinelRef = useEndReached(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  });

  // Newest-first, matching the API and the column-reverse layout.
  const messages = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);

  // Seen receipt renders only under our newest delivered message.
  const receiptMessageId = useMemo(
    () => messages.find((m) => m.sender.id === ownId && !m._status && !m.isDeleted)?.id,
    [messages, ownId]
  );

  const handleSend = (draft: MessageDraft) => {
    void send(draft);
    setReplyTo(null);
  };

  const handleReply = (message: DmMessage) => {
    setReplyTo({ id: message.id, content: message.content, sender: message.sender });
  };

  // Optimistic reaction toggle; the `message_reaction` socket event is the
  // source of truth, the catch only rolls back a failed HTTP call.
  const handleReact = (message: DmMessage, emoji: string) => {
    const prev = message.reactions;
    const ids = prev?.[emoji] ?? [];
    const nextIds = ids.includes(ownId) ? ids.filter((id) => id !== ownId) : [...ids, ownId];
    patchMessage(queryClient, conversationId, message.id, {
      reactions: { ...(prev ?? {}), [emoji]: nextIds },
    });
    dmApi.toggleReaction(message.id, emoji).catch(() => {
      patchMessage(queryClient, conversationId, message.id, { reactions: prev ?? null });
      toast('Could not react to message', 'error');
    });
  };

  const confirmUnsend = () => {
    const target = unsendTarget;
    if (!target) return;
    patchMessage(queryClient, conversationId, target.id, {
      isDeleted: true,
      content: null,
      mediaUrl: null,
    });
    dmApi.deleteMessage(target.id).catch(() => {
      void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      toast('Could not unsend message', 'error');
    });
  };

  const other = conversation ? otherParticipants(conversation, ownId)[0] : undefined;
  const name = conversation ? conversationName(conversation, ownId) : '';

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border-light px-4 dark:border-border-dark">
        <Link
          to="/messages"
          aria-label="Back to conversations"
          className="-ml-2 rounded-full p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 md:hidden"
        >
          <ChevronLeft size={26} />
        </Link>

        {conversation ? (
          <>
            <ConversationAvatar conversation={conversation} ownId={ownId} size={40} />
            <div className="min-w-0 flex-1">
              {!conversation.isGroup && other ? (
                <Link to={`/${other.username}`} className="block truncate text-sm font-bold hover:underline">
                  {name}
                </Link>
              ) : (
                <p className="truncate text-sm font-bold">{name}</p>
              )}
              <p className="truncate text-xs text-muted-light dark:text-muted-dark">
                {activityLabel(conversation, ownId)}
              </p>
            </div>
            {conversation.isGroup && (
              <button
                onClick={() => setInfoOpen(true)}
                aria-label="Group details"
                className="rounded-full p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <Info size={24} />
              </button>
            )}
          </>
        ) : (
          <div className="flex items-center gap-3" aria-hidden>
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-2.5 w-20" />
            </div>
          </div>
        )}
      </header>

      {/* Messages — column-reverse keeps the view pinned to the newest message
          and makes upward "load older" scroll anchoring free. */}
      <div
        role="log"
        aria-label="Messages"
        className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto px-4 py-3"
      >
        {typingUsers.length > 0 && conversation && (
          <TypingIndicator users={typingUsers} conversation={conversation} />
        )}

        {messages.map((message, i) => {
          const newer = i > 0 ? messages[i - 1] : undefined;
          const older = messages[i + 1];
          const isLastOfGroup = !newer || !sameGroup(message, newer);
          const isFirstOfGroup = !older || !sameGroup(message, older);
          const showSeparator = older
            ? new Date(message.createdAt).getTime() - new Date(older.createdAt).getTime() >
              SEPARATOR_GAP_MS
            : !hasNextPage && !isLoading;
          return (
            <Fragment key={message.id}>
              <div className={cn(isLastOfGroup ? 'pb-2.5' : 'pb-0.5')}>
                <MessageBubble
                  message={message}
                  ownId={ownId}
                  isOwn={message.sender.id === ownId}
                  isGroupChat={conversation?.isGroup ?? false}
                  isFirstOfGroup={isFirstOfGroup}
                  isLastOfGroup={isLastOfGroup}
                  receipt={
                    message.id === receiptMessageId && conversation
                      ? seenLabel(message, conversation, ownId)
                      : null
                  }
                  onReact={handleReact}
                  onReply={handleReply}
                  onUnsend={setUnsendTarget}
                  onRetry={retry}
                  onOpenMedia={setLightbox}
                />
              </div>
              {/* In column-reverse, a DOM-later sibling renders visually above. */}
              {showSeparator && (
                <p className="py-3 text-center text-[11px] font-medium text-muted-light dark:text-muted-dark">
                  {separatorLabel(message.createdAt)}
                </p>
              )}
            </Fragment>
          );
        })}

        {isFetchingNextPage && (
          <div className="flex justify-center py-3" aria-hidden>
            <Spinner size={18} className="text-neutral-400" />
          </div>
        )}
        {hasNextPage && <div ref={sentinelRef} className="h-px shrink-0" aria-hidden />}

        {isLoading && <ThreadSkeleton />}

        {!isLoading && messages.length === 0 && conversation && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
            <ConversationAvatar conversation={conversation} ownId={ownId} size={72} />
            <p className="text-base font-bold">{name}</p>
            {!conversation.isGroup && other ? (
              <Link
                to={`/${other.username}`}
                className="rounded-lg bg-neutral-100 px-4 py-1.5 text-sm font-semibold hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
              >
                View profile
              </Link>
            ) : (
              <p className="text-sm text-muted-light dark:text-muted-dark">
                Say hi to the group 👋
              </p>
            )}
          </div>
        )}
      </div>

      {/* Composer */}
      <Composer
        conversationId={conversationId}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSend={handleSend}
      />

      {/* Unsend confirmation */}
      <ConfirmDialog
        open={!!unsendTarget}
        onClose={() => setUnsendTarget(null)}
        onConfirm={confirmUnsend}
        title="Unsend message?"
        body="Unsending removes the message for everyone in the chat."
        confirmLabel="Unsend"
      />

      {/* Media lightbox */}
      <Modal
        open={!!lightbox}
        onClose={() => setLightbox(null)}
        title={lightbox?.type === 'VIDEO' ? 'Video' : 'Photo'}
        className="max-w-3xl"
      >
        {lightbox &&
          (lightbox.type === 'VIDEO' ? (
            <video src={lightbox.url} controls autoPlay playsInline className="max-h-[78vh] w-full bg-black object-contain" />
          ) : (
            <img src={lightbox.url} alt="Full size attachment" className="max-h-[78vh] w-full object-contain" />
          ))}
      </Modal>

      {conversation?.isGroup && (
        <GroupInfoSheet
          open={infoOpen}
          onClose={() => setInfoOpen(false)}
          conversation={conversation}
        />
      )}
    </div>
  );
}

function TypingIndicator({
  users,
  conversation,
}: {
  users: TypingUser[];
  conversation: Conversation;
}) {
  const first = users[0];
  const avatarUrl = conversation.participants.find((p) => p.id === first?.userId)?.avatarUrl;
  const label =
    users.length === 1
      ? `${first?.username ?? 'Someone'} is typing`
      : `${users.map((u) => u.username).join(', ')} are typing`;

  return (
    <div className="flex items-end gap-2 pb-1 pt-2" aria-live="polite">
      <Avatar src={avatarUrl} alt={first?.username ?? ''} size={28} />
      <span className="flex items-center gap-1 rounded-3xl bg-neutral-100 px-4 py-3 dark:bg-neutral-800" aria-hidden>
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 dark:bg-neutral-500"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
      <span className="sr-only">{label}</span>
    </div>
  );
}

function ThreadSkeleton() {
  // Alternating bubbles, rendered into the column-reverse container.
  const rows = [
    { own: false, w: 'w-48' },
    { own: true, w: 'w-36' },
    { own: true, w: 'w-52' },
    { own: false, w: 'w-40' },
    { own: false, w: 'w-56' },
    { own: true, w: 'w-32' },
  ];
  return (
    <div aria-hidden className="space-y-3 py-2">
      {rows.map((row, i) => (
        <div key={i} className={cn('flex items-end gap-2', row.own && 'flex-row-reverse')}>
          {!row.own && <Skeleton className="h-7 w-7 rounded-full" />}
          <Skeleton className={cn('h-9 rounded-3xl', row.w)} />
        </div>
      ))}
    </div>
  );
}
