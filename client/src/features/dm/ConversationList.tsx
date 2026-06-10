import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Send, SquarePen } from 'lucide-react';
import type { Conversation } from '../../types';
import { useAuthStore } from '../../stores/authStore';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { Button } from '../../components/ui/Button';
import { cn } from '../../utils/cn';
import { timeAgo } from '../../utils/timeAgo';
import { conversationName, messagePreview } from './helpers';
import { useConversations, useEndReached } from './hooks';
import { ConversationAvatar } from './ConversationAvatar';

// Inbox pane: header with compose, client-side filter, infinite list.
export function ConversationList({
  activeId,
  onCompose,
}: {
  activeId?: string;
  onCompose: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const [filter, setFilter] = useState('');
  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useConversations();
  const sentinelRef = useEndReached(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  });

  const conversations = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);
  const ownId = user?.id ?? '';

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      if (conversationName(c, ownId).toLowerCase().includes(q)) return true;
      return c.participants.some(
        (p) =>
          p.id !== ownId &&
          (p.username.toLowerCase().includes(q) || p.fullName.toLowerCase().includes(q))
      );
    });
  }, [conversations, filter, ownId]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center justify-between px-4 pt-2">
        <h1 className="truncate text-xl font-bold">{user?.username}</h1>
        <button
          onClick={onCompose}
          aria-label="New message"
          className="rounded-full p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <SquarePen size={24} />
        </button>
      </div>

      <div className="px-4 pb-3">
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
            aria-hidden
          />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search"
            aria-label="Search conversations"
            className={cn(
              'w-full rounded-lg border-0 bg-neutral-100 py-2 pl-9 pr-3 text-sm outline-none',
              'placeholder:text-neutral-400 dark:bg-neutral-800'
            )}
          />
        </div>
      </div>

      <h2 className="px-4 pb-1 text-base font-bold">Messages</h2>

      <div className="flex-1 overflow-y-auto" role="list" aria-label="Conversations">
        {isLoading && <ConversationListSkeleton />}

        {!isLoading && conversations.length === 0 && (
          <EmptyState
            icon={Send}
            title="No messages yet"
            body="Start a conversation with a friend."
            action={<Button onClick={onCompose}>Send message</Button>}
          />
        )}

        {!isLoading && conversations.length > 0 && filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted-light dark:text-muted-dark">
            No results found.
          </p>
        )}

        {filtered.map((conversation) => (
          <ConversationRow
            key={conversation.id}
            conversation={conversation}
            ownId={ownId}
            active={conversation.id === activeId}
          />
        ))}

        {hasNextPage && <div ref={sentinelRef} className="h-px" aria-hidden />}
        {isFetchingNextPage && <ConversationRowSkeleton />}
      </div>
    </div>
  );
}

function ConversationRow({
  conversation,
  ownId,
  active,
}: {
  conversation: Conversation;
  ownId: string;
  active: boolean;
}) {
  const name = conversationName(conversation, ownId);
  const last = conversation.lastMessage;
  const unread = conversation.unreadCount > 0;

  return (
    <Link
      role="listitem"
      to={`/messages/${conversation.id}`}
      aria-label={`Conversation with ${name}${unread ? `, ${conversation.unreadCount} unread` : ''}`}
      className={cn(
        'flex items-center gap-3 px-4 py-2 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900',
        active && 'bg-neutral-100 dark:bg-neutral-900'
      )}
    >
      <ConversationAvatar conversation={conversation} ownId={ownId} size={56} />
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm', unread ? 'font-bold' : 'font-medium')}>{name}</p>
        <p
          className={cn(
            'truncate text-xs',
            unread
              ? 'font-semibold text-black dark:text-white'
              : 'text-muted-light dark:text-muted-dark'
          )}
        >
          {last
            ? `${messagePreview(last, ownId)} · ${timeAgo(last.createdAt)}`
            : `Say hi to ${name}`}
        </p>
      </div>
      {unread && (
        <span
          className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-white"
          aria-hidden
        >
          {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
        </span>
      )}
    </Link>
  );
}

function ConversationRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-2" aria-hidden>
      <Skeleton className="h-14 w-14 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-2.5 w-44" />
      </div>
    </div>
  );
}

export function ConversationListSkeleton() {
  return (
    <div aria-hidden>
      {Array.from({ length: 8 }).map((_, i) => (
        <ConversationRowSkeleton key={i} />
      ))}
    </div>
  );
}
