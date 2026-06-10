import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import type { Author, Conversation, MediaType, Message, MessageType, Page } from '../../types';
import { useAuthStore } from '../../stores/authStore';
import { uploadFiles } from '../../services/upload';
import { dmApi, nextPageCursor } from './api';
import {
  bumpConversation,
  insertMessage,
  patchMessage,
  removeMessage,
  replaceMessage,
  type DmMessage,
} from './cache';

// ───────────────────────── generic utilities ─────────────────────────

// Trailing-edge debounce with timer cleanup on change/unmount.
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

// Infinite-scroll sentinel as a callback ref (works for conditionally
// mounted nodes; disconnects on detach).
export function useEndReached(onEndReached?: () => void) {
  const handlerRef = useRef(onEndReached);
  handlerRef.current = onEndReached;
  const observerRef = useRef<IntersectionObserver | null>(null);

  return useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) handlerRef.current?.();
      },
      { rootMargin: '400px 0px' }
    );
    observer.observe(node);
    observerRef.current = observer;
  }, []);
}

// ───────────────────────── queries ─────────────────────────

export function useConversations() {
  return useInfiniteQuery({
    queryKey: ['conversations'],
    queryFn: ({ pageParam }) => dmApi.conversations(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextPageCursor,
  });
}

export function useConversation(conversationId: string | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => dmApi.conversation(conversationId!),
    enabled: !!conversationId,
    // Seed from the inbox cache for an instant header paint, refetch right away.
    initialData: () => {
      const list = queryClient.getQueryData<InfiniteData<Page<Conversation>>>(['conversations']);
      return list?.pages.flatMap((p) => p.data).find((c) => c.id === conversationId);
    },
    initialDataUpdatedAt: 0,
  });
}

export function useMessages(conversationId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['messages', conversationId],
    queryFn: ({ pageParam }) =>
      dmApi.messages(conversationId!, pageParam) as Promise<Page<DmMessage>>,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextPageCursor,
    enabled: !!conversationId,
  });
}

export function useUserSearch(q: string) {
  const trimmed = q.trim();
  return useQuery({
    queryKey: ['dm-user-search', trimmed],
    queryFn: () => dmApi.searchUsers(trimmed),
    enabled: trimmed.length > 0,
  });
}

// ───────────────────────── optimistic send ─────────────────────────

export interface MessageDraft {
  type: MessageType;
  content?: string;
  file?: File;
  previewUrl?: string;
  mediaType?: MediaType;
  replyTo?: NonNullable<Message['replyTo']>;
}

let tempCounter = 0;

export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const send = useCallback(
    async (draft: MessageDraft) => {
      if (!user) return;
      const sender: Author = {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        isVerified: user.isVerified,
      };
      const tempId = `temp-${Date.now()}-${++tempCounter}`;
      const temp: DmMessage = {
        id: tempId,
        conversationId,
        type: draft.type,
        content: draft.content ?? null,
        mediaUrl: draft.previewUrl ?? null,
        mediaType:
          draft.mediaType ??
          (draft.file ? (draft.file.type.startsWith('video') ? 'VIDEO' : 'IMAGE') : null),
        replyTo: draft.replyTo ?? null,
        reactions: null,
        isDeleted: false,
        createdAt: new Date().toISOString(),
        sender,
        seenBy: [],
        _status: 'sending',
        _file: draft.file,
      };
      insertMessage(queryClient, temp);
      try {
        let mediaUrl: string | undefined;
        let mediaType = draft.mediaType;
        if (draft.file) {
          const [uploaded] = await uploadFiles([draft.file]);
          if (!uploaded) throw new Error('Upload failed');
          mediaUrl = uploaded.url;
          mediaType = uploaded.mediaType;
        }
        const real = (await dmApi.sendMessage(conversationId, {
          type: draft.type,
          content: draft.content?.trim() || undefined,
          mediaUrl,
          mediaType,
          replyToId: draft.replyTo?.id,
        })) as DmMessage;
        replaceMessage(queryClient, conversationId, tempId, real);
        if (!bumpConversation(queryClient, real)) {
          void queryClient.invalidateQueries({ queryKey: ['conversations'] });
        }
      } catch {
        patchMessage(queryClient, conversationId, tempId, { _status: 'failed' });
      }
    },
    [conversationId, queryClient, user]
  );

  // Re-send a failed optimistic message (media retries reuse the kept File).
  const retry = useCallback(
    (failed: DmMessage) => {
      removeMessage(queryClient, conversationId, failed.id);
      void send({
        type: failed.type,
        content: failed.content ?? undefined,
        file: failed._file,
        previewUrl: failed.mediaUrl ?? undefined,
        mediaType: failed._file ? undefined : (failed.mediaType ?? undefined),
        replyTo: failed.replyTo ?? undefined,
      });
    },
    [conversationId, queryClient, send]
  );

  return { send, retry };
}
