import type { Notification, NotificationType } from '../../types';

// Pure helpers: per-type action text, tap navigation, consecutive grouping
// and Today / This week / Earlier sectioning.

export const ACTION_TEXT: Record<NotificationType, string> = {
  FOLLOW: 'started following you',
  FOLLOW_REQUEST: 'requested to follow you',
  FOLLOW_ACCEPTED: 'accepted your follow request',
  LIKE_POST: 'liked your photo',
  LIKE_REEL: 'liked your reel',
  LIKE_COMMENT: 'liked your comment',
  COMMENT_POST: 'commented on your photo',
  COMMENT_REEL: 'commented on your reel',
  COMMENT_REPLY: 'replied to your comment',
  MENTION_COMMENT: 'mentioned you in a comment',
  MENTION_CAPTION: 'mentioned you in a post',
  TAGGED_IN_POST: 'tagged you in a post',
  MESSAGE: 'sent you a message',
};

export function actionText(type: NotificationType): string {
  return ACTION_TEXT[type] ?? 'sent you a notification';
}

// Where a tap on the row goes. COMMENT targets can't be resolved to their
// post client-side in v1, so they fall back to the sender's profile.
export function targetPath(n: Notification): string {
  if (!n.targetId) return `/${n.sender.username}`;
  switch (n.targetType) {
    case 'POST':
      return `/p/${n.targetId}`;
    case 'REEL':
      return `/reels/${n.targetId}`;
    case 'CONVERSATION':
      return `/messages/${n.targetId}`;
    case 'COMMENT':
    case 'USER':
    case 'STORY':
    default:
      return `/${n.sender.username}`;
  }
}

// Only content notifications collapse; follow-flavored rows carry per-sender
// actions (Accept/Decline, Follow back) and must stay individual.
const GROUPABLE: ReadonlySet<NotificationType> = new Set<NotificationType>([
  'LIKE_POST',
  'LIKE_REEL',
  'LIKE_COMMENT',
  'COMMENT_POST',
  'COMMENT_REEL',
  'COMMENT_REPLY',
  'MENTION_COMMENT',
  'MENTION_CAPTION',
  'TAGGED_IN_POST',
]);

export interface NotificationGroup {
  key: string;
  // Newest (representative) notification of the run.
  head: Notification;
  // Distinct senders in the run, newest first (head's sender included).
  senders: Notification['sender'][];
  isRead: boolean;
}

// Collapses consecutive notifications sharing type + targetId across the
// loaded pages (input is newest-first, as returned by the API).
export function groupNotifications(items: Notification[]): NotificationGroup[] {
  const groups: NotificationGroup[] = [];
  for (const n of items) {
    const last = groups.length > 0 ? groups[groups.length - 1] : undefined;
    const mergeable =
      last !== undefined &&
      GROUPABLE.has(n.type) &&
      last.head.type === n.type &&
      last.head.targetId !== null &&
      last.head.targetId === n.targetId;
    if (mergeable && last) {
      if (!last.senders.some((s) => s.id === n.sender.id)) last.senders.push(n.sender);
      last.isRead = last.isRead && n.isRead;
    } else {
      groups.push({ key: n.id, head: n, senders: [n.sender], isRead: n.isRead });
    }
  }
  return groups;
}

export type SectionLabel = 'Today' | 'This week' | 'Earlier';

export function sectionLabel(iso: string): SectionLabel {
  const created = new Date(iso).getTime();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (created >= startOfToday) return 'Today';
  if (created >= startOfToday - 6 * 86_400_000) return 'This week';
  return 'Earlier';
}
