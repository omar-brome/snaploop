import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { Conversation, Message, Page } from '../../types';

// React Query cache surgery for the DM feature. Message pages are stored
// newest-first (mirrors the API); conversations by updatedAt desc.

// Local-only fields used by optimistic sends. `_file` keeps the picked File
// alive in memory so a failed media send can be retried without re-picking.
export interface DmMessage extends Message {
  _status?: 'sending' | 'failed';
  _file?: File;
}

type MessagesData = InfiniteData<Page<DmMessage>, string | undefined>;
type ConversationsData = InfiniteData<Page<Conversation>, string | undefined>;

function mapMessages(
  data: MessagesData | undefined,
  fn: (message: DmMessage) => DmMessage
): MessagesData | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({ ...page, data: page.data.map(fn) })),
  };
}

// Insert at the newest end (front of the first page). No-op when the id is
// already cached (socket + HTTP response race) or the thread was never loaded.
export function insertMessage(qc: QueryClient, message: DmMessage): void {
  qc.setQueryData<MessagesData>(['messages', message.conversationId], (data) => {
    if (!data || data.pages.length === 0) return data;
    if (data.pages.some((p) => p.data.some((m) => m.id === message.id))) return data;
    const [first, ...rest] = data.pages;
    return { ...data, pages: [{ ...first, data: [message, ...first.data] }, ...rest] };
  });
}

// Swap an optimistic temp for the real server message; if the socket already
// delivered the real one, just drop the temp.
export function replaceMessage(
  qc: QueryClient,
  conversationId: string,
  tempId: string,
  real: DmMessage
): void {
  qc.setQueryData<MessagesData>(['messages', conversationId], (data) => {
    if (!data) return data;
    const alreadyThere = data.pages.some((p) => p.data.some((m) => m.id === real.id));
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        data: alreadyThere
          ? page.data.filter((m) => m.id !== tempId)
          : page.data.map((m) => (m.id === tempId ? real : m)),
      })),
    };
  });
}

export function patchMessage(
  qc: QueryClient,
  conversationId: string,
  messageId: string,
  patch: Partial<DmMessage>
): void {
  qc.setQueryData<MessagesData>(['messages', conversationId], (data) =>
    mapMessages(data, (m) => (m.id === messageId ? { ...m, ...patch } : m))
  );
}

export function removeMessage(qc: QueryClient, conversationId: string, messageId: string): void {
  qc.setQueryData<MessagesData>(['messages', conversationId], (data) => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        data: page.data.filter((m) => m.id !== messageId),
      })),
    };
  });
}

export function hasPendingSend(qc: QueryClient, conversationId: string): boolean {
  const data = qc.getQueryData<MessagesData>(['messages', conversationId]);
  return !!data?.pages.some((p) => p.data.some((m) => m._status === 'sending'));
}

// Apply `fn` to every cached conversation: the infinite inbox list and any
// single ['conversation', id] detail entries.
export function patchConversations(qc: QueryClient, fn: (c: Conversation) => Conversation): void {
  qc.setQueryData<ConversationsData>(['conversations'], (data) => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((page) => ({ ...page, data: page.data.map(fn) })),
    };
  });
  qc.setQueriesData<Conversation>({ queryKey: ['conversation'] }, (c) => (c ? fn(c) : c));
}

// Move a conversation to the top of the inbox with a fresh lastMessage.
// Returns false when the conversation isn't cached (caller should invalidate).
export function bumpConversation(qc: QueryClient, message: Message): boolean {
  let found = false;
  qc.setQueryData<ConversationsData>(['conversations'], (data) => {
    if (!data || data.pages.length === 0) return data;
    let target: Conversation | undefined;
    const pages = data.pages.map((page) => {
      const kept = page.data.filter((c) => {
        if (c.id === message.conversationId) {
          target = c;
          return false;
        }
        return true;
      });
      return kept.length === page.data.length ? page : { ...page, data: kept };
    });
    if (!target) return data;
    found = true;
    const updated: Conversation = { ...target, lastMessage: message, updatedAt: message.createdAt };
    const [first, ...rest] = pages;
    return { ...data, pages: [{ ...first, data: [updated, ...first.data] }, ...rest] };
  });
  return found;
}

export function incrementUnread(qc: QueryClient, conversationId: string): void {
  patchConversations(qc, (c) =>
    c.id === conversationId ? { ...c, unreadCount: c.unreadCount + 1 } : c
  );
}

export function markConversationRead(qc: QueryClient, conversationId: string): void {
  patchConversations(qc, (c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c));
}

// messages_seen: bump the participant's lastReadAt and extend seenBy on every
// message they have now read.
export function applySeen(
  qc: QueryClient,
  conversationId: string,
  userId: string,
  lastReadAt: string
): void {
  patchConversations(qc, (c) =>
    c.id === conversationId
      ? {
          ...c,
          participants: c.participants.map((p) => (p.id === userId ? { ...p, lastReadAt } : p)),
        }
      : c
  );
  const cutoff = new Date(lastReadAt).getTime();
  qc.setQueryData<MessagesData>(['messages', conversationId], (data) =>
    mapMessages(data, (m) => {
      if (m.sender.id === userId || m.seenBy?.includes(userId)) return m;
      if (new Date(m.createdAt).getTime() > cutoff) return m;
      return { ...m, seenBy: [...(m.seenBy ?? []), userId] };
    })
  );
}

export function setUserPresence(
  qc: QueryClient,
  userId: string,
  isOnline: boolean,
  lastSeenAt?: string
): void {
  patchConversations(qc, (c) => {
    if (!c.participants.some((p) => p.id === userId)) return c;
    return {
      ...c,
      participants: c.participants.map((p) =>
        p.id === userId ? { ...p, isOnline, ...(lastSeenAt ? { lastSeenAt } : {}) } : p
      ),
    };
  });
}
