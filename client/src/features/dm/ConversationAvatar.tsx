import type { Conversation } from '../../types';
import { Avatar } from '../../components/ui/Avatar';
import { otherParticipants } from './helpers';

// Single avatar with a green presence dot for 1:1 chats; two overlapped
// avatars (or the group photo) for groups.
export function ConversationAvatar({
  conversation,
  ownId,
  size = 48,
}: {
  conversation: Conversation;
  ownId: string;
  size?: number;
}) {
  const others = otherParticipants(conversation, ownId);

  if (conversation.isGroup) {
    if (conversation.groupAvatarUrl) {
      return (
        <Avatar
          src={conversation.groupAvatarUrl}
          alt={conversation.groupName ?? 'Group'}
          size={size}
        />
      );
    }
    const [first, second] = others;
    const small = Math.round(size * 0.68);
    return (
      <span
        className="relative inline-block shrink-0"
        style={{ width: size, height: size }}
        aria-hidden
      >
        <Avatar
          src={first?.avatarUrl}
          alt={first?.username ?? ''}
          size={small}
          className="absolute left-0 top-0"
        />
        <span className="absolute bottom-0 right-0 rounded-full ring-2 ring-white dark:ring-black">
          <Avatar src={second?.avatarUrl} alt={second?.username ?? ''} size={small} />
        </span>
      </span>
    );
  }

  const other = others[0];
  const dot = Math.max(10, Math.round(size * 0.26));
  return (
    <span className="relative inline-block shrink-0">
      <Avatar src={other?.avatarUrl} alt={other?.username ?? ''} size={size} />
      {other?.isOnline && (
        <span
          role="img"
          aria-label="Online"
          className="absolute bottom-0 right-0 block rounded-full bg-green-500 ring-2 ring-white dark:ring-black"
          style={{ width: dot, height: dot }}
        />
      )}
    </span>
  );
}
