import type { Conversation, Message, Participant } from '../../types';
import { timeAgo } from '../../utils/timeAgo';

// Presence patches may attach a lastSeenAt (from the user_offline event).
export type DmParticipant = Participant & { lastSeenAt?: string | null };

export function otherParticipants(conversation: Conversation, ownId: string): DmParticipant[] {
  return conversation.participants.filter((p) => p.id !== ownId);
}

export function conversationName(conversation: Conversation, ownId: string): string {
  const others = otherParticipants(conversation, ownId);
  if (conversation.isGroup) {
    return (
      conversation.groupName?.trim() ||
      others.map((p) => p.username).join(', ') ||
      'Group chat'
    );
  }
  const other = others[0];
  return other ? other.fullName || other.username : 'Conversation';
}

// Subtitle for the thread header: presence for 1:1, member summary for groups.
export function activityLabel(conversation: Conversation, ownId: string): string {
  const others = otherParticipants(conversation, ownId);
  if (conversation.isGroup) {
    if (others.some((p) => p.isOnline)) return 'Active now';
    return `${conversation.participants.length} members`;
  }
  const other = others[0];
  if (!other) return '';
  if (other.isOnline) return 'Active now';
  const lastSeen = other.lastSeenAt ?? other.lastReadAt;
  return lastSeen ? `Active ${timeAgo(lastSeen)} ago` : `@${other.username}`;
}

// Inbox one-line preview for the last message.
export function messagePreview(message: Message, ownId: string): string {
  const own = message.sender.id === ownId;
  if (message.isDeleted) return own ? 'You unsent a message' : 'Unsent a message';
  const prefix = own ? 'You: ' : '';
  switch (message.type) {
    case 'IMAGE':
      return `${prefix}[Photo]`;
    case 'VIDEO':
      return `${prefix}[Video]`;
    case 'SHARED_POST':
      return `${prefix}[Post]`;
    case 'SHARED_REEL':
      return `${prefix}[Reel]`;
    case 'STORY_REPLY':
      return `${prefix}Reacted to a story`;
    default:
      return `${prefix}${message.content ?? ''}`;
  }
}

// Seen receipt under the sender's last message: "Seen" 1:1, "Seen by N" groups.
export function seenLabel(message: Message, conversation: Conversation, ownId: string): string | null {
  const seenBy = message.seenBy ?? [];
  const seen = otherParticipants(conversation, ownId).filter((p) => seenBy.includes(p.id));
  if (seen.length === 0) return null;
  return conversation.isGroup ? `Seen by ${seen.length}` : 'Seen';
}

// Short text for a reply-to quote block.
export function quotePreview(replyTo: NonNullable<Message['replyTo']>): string {
  return replyTo.content?.trim() || 'Attachment';
}
