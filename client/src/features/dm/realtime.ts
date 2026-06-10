import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '../../services/socket';
import { useAuthStore } from '../../stores/authStore';
import { dmApi } from './api';
import {
  applySeen,
  bumpConversation,
  hasPendingSend,
  incrementUnread,
  insertMessage,
  markConversationRead,
  patchConversations,
  patchMessage,
  setUserPresence,
  type DmMessage,
} from './cache';

// ───────────────────────── global DM listeners ─────────────────────────
// Mounted once by MessagesPage. `openConversationId` tracks the thread the
// user is looking at so its messages append in place and get marked read.

export function useDmRealtime(openConversationId: string | undefined) {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const openIdRef = useRef(openConversationId);
  openIdRef.current = openConversationId;

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !userId) return;

    const markRead = (conversationId: string) => {
      dmApi
        .markRead(conversationId)
        .then(() => {
          markConversationRead(queryClient, conversationId);
          void queryClient.invalidateQueries({ queryKey: ['unread-dms'] });
        })
        .catch(() => undefined);
    };

    const onNewMessage = (message: DmMessage) => {
      const openId = openIdRef.current;
      const isOwn = message.sender.id === userId;
      if (message.conversationId === openId) {
        // Own sends already render an optimistic temp; the HTTP response
        // replaces it. Only insert socket copies when nothing is pending
        // (e.g. sent from another tab/device).
        if (!isOwn || !hasPendingSend(queryClient, openId)) {
          insertMessage(queryClient, message);
        }
        if (!bumpConversation(queryClient, message)) {
          void queryClient.invalidateQueries({ queryKey: ['conversations'] });
        }
        // Still looking at the thread → immediately mark it seen.
        if (!isOwn && document.hasFocus()) markRead(openId);
      } else {
        // Keep any cached thread fresh, then let the server recount.
        insertMessage(queryClient, message);
        if (bumpConversation(queryClient, message)) {
          if (!isOwn) incrementUnread(queryClient, message.conversationId);
        } else {
          void queryClient.invalidateQueries({ queryKey: ['conversations'] });
        }
        void queryClient.invalidateQueries({ queryKey: ['unread-dms'] });
      }
    };

    const onReaction = (payload: {
      messageId: string;
      conversationId: string;
      reactions: Record<string, string[]> | null;
    }) => {
      patchMessage(queryClient, payload.conversationId, payload.messageId, {
        reactions: payload.reactions,
      });
    };

    const onDeleted = (payload: { messageId: string; conversationId: string }) => {
      patchMessage(queryClient, payload.conversationId, payload.messageId, {
        isDeleted: true,
        content: null,
        mediaUrl: null,
      });
      patchConversations(queryClient, (c) =>
        c.lastMessage?.id === payload.messageId
          ? { ...c, lastMessage: { ...c.lastMessage, isDeleted: true, content: null, mediaUrl: null } }
          : c
      );
    };

    const onSeen = (payload: { conversationId: string; userId: string; lastReadAt: string }) => {
      applySeen(queryClient, payload.conversationId, payload.userId, payload.lastReadAt);
    };

    const onOnline = (payload: { userId: string }) => {
      setUserPresence(queryClient, payload.userId, true);
    };
    const onOffline = (payload: { userId: string; lastSeenAt?: string }) => {
      setUserPresence(queryClient, payload.userId, false, payload.lastSeenAt);
    };

    socket.on('new_message', onNewMessage);
    socket.on('message_reaction', onReaction);
    socket.on('message_deleted', onDeleted);
    socket.on('messages_seen', onSeen);
    socket.on('user_online', onOnline);
    socket.on('user_offline', onOffline);
    return () => {
      socket.off('new_message', onNewMessage);
      socket.off('message_reaction', onReaction);
      socket.off('message_deleted', onDeleted);
      socket.off('messages_seen', onSeen);
      socket.off('user_online', onOnline);
      socket.off('user_offline', onOffline);
    };
  }, [queryClient, userId]);
}

// ───────────────────────── thread lifecycle ─────────────────────────
// Join the socket room while a thread is open and mark it read on open and
// whenever the window regains focus.

export function useThreadPresence(conversationId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getSocket();
    socket?.emit('conversation:join', conversationId);

    const markRead = () => {
      dmApi
        .markRead(conversationId)
        .then(() => {
          markConversationRead(queryClient, conversationId);
          void queryClient.invalidateQueries({ queryKey: ['unread-dms'] });
        })
        .catch(() => undefined);
    };
    markRead();
    window.addEventListener('focus', markRead);

    return () => {
      socket?.emit('conversation:leave', conversationId);
      window.removeEventListener('focus', markRead);
    };
  }, [conversationId, queryClient]);
}

// ───────────────────────── typing indicator ─────────────────────────
// Tracks who is typing in this conversation; entries auto-expire after 3s
// unless refreshed, and clear immediately on isTyping=false.

export interface TypingUser {
  userId: string;
  username: string;
}

export function useTypingUsers(conversationId: string): TypingUser[] {
  const ownId = useAuthStore((s) => s.user?.id);
  const [typing, setTyping] = useState<TypingUser[]>([]);
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    setTyping([]);
    const socket = getSocket();
    if (!socket) return;
    const timers = timersRef.current;

    const remove = (userId: string) => {
      const timer = timers.get(userId);
      if (timer) clearTimeout(timer);
      timers.delete(userId);
      setTyping((list) => list.filter((t) => t.userId !== userId));
    };

    const onTyping = (payload: {
      conversationId: string;
      userId: string;
      username: string;
      isTyping: boolean;
    }) => {
      if (payload.conversationId !== conversationId || payload.userId === ownId) return;
      if (!payload.isTyping) {
        remove(payload.userId);
        return;
      }
      const existing = timers.get(payload.userId);
      if (existing) clearTimeout(existing);
      timers.set(
        payload.userId,
        setTimeout(() => remove(payload.userId), 3000)
      );
      setTyping((list) =>
        list.some((t) => t.userId === payload.userId)
          ? list
          : [...list, { userId: payload.userId, username: payload.username }]
      );
    };

    socket.on('user_typing', onTyping);
    return () => {
      socket.off('user_typing', onTyping);
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, [conversationId, ownId]);

  return typing;
}
