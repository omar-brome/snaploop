import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link2 } from 'lucide-react';
import type { Conversation } from '../../types';
import { useAuthStore } from '../../stores/authStore';
import { toast } from '../../stores/uiStore';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { reelLink, reelsApi } from './api';

function conversationLabel(c: Conversation, meId: string | undefined): string {
  if (c.isGroup) return c.groupName || 'Group';
  const other = c.participants.find((p) => p.id !== meId) ?? c.participants[0];
  return other?.username ?? 'Conversation';
}

function conversationAvatar(c: Conversation, meId: string | undefined): string | null {
  if (c.isGroup) return c.groupAvatarUrl;
  const other = c.participants.find((p) => p.id !== meId) ?? c.participants[0];
  return other?.avatarUrl ?? null;
}

interface ShareSheetProps {
  reelId: string;
  open: boolean;
  onClose: () => void;
}

// "Share to…" sheet: copy link + send the reel into a conversation.
export function ShareSheet({ reelId, open, onClose }: ShareSheetProps) {
  const me = useAuthStore((s) => s.user);
  const [sentTo, setSentTo] = useState<ReadonlySet<string>>(new Set());

  const { data, isLoading, isError } = useQuery({
    queryKey: ['reels', 'share-conversations'],
    queryFn: () => reelsApi.conversations(),
    enabled: open,
  });

  const send = useMutation({
    mutationFn: (conversationId: string) => reelsApi.shareReel(conversationId, reelId),
    onSuccess: (_data, conversationId) => {
      setSentTo((prev) => new Set(prev).add(conversationId));
      toast('Sent');
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Could not send', 'error'),
  });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(reelLink(reelId));
      toast('Link copied');
      onClose();
    } catch {
      toast('Could not copy link', 'error');
    }
  };

  const conversations = data?.data ?? [];

  return (
    <Modal open={open} onClose={onClose} title="Share to…" variant="sheet">
      <div className="flex flex-col pb-2">
        <button
          type="button"
          onClick={copyLink}
          className="flex items-center gap-3 px-4 py-3 text-left text-sm font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
            <Link2 size={20} />
          </span>
          Copy link
        </button>

        {isLoading && (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        )}
        {isError && (
          <p className="px-4 py-6 text-center text-sm text-muted-light dark:text-muted-dark">
            Couldn't load your conversations.
          </p>
        )}
        {!isLoading && !isError && conversations.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-light dark:text-muted-dark">
            No conversations yet.
          </p>
        )}

        {conversations.map((c) => {
          const sent = sentTo.has(c.id);
          return (
            <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
              <Avatar src={conversationAvatar(c, me?.id)} alt={conversationLabel(c, me?.id)} size={40} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {conversationLabel(c, me?.id)}
              </span>
              <Button
                size="sm"
                variant={sent ? 'secondary' : 'primary'}
                disabled={sent || (send.isPending && send.variables === c.id)}
                onClick={() => send.mutate(c.id)}
                aria-label={`Send to ${conversationLabel(c, me?.id)}`}
              >
                {sent ? 'Sent' : 'Send'}
              </Button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
