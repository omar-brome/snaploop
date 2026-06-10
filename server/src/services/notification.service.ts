import { NotificationType, NotificationTargetType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { emitToUser } from '../sockets/index';

// Central place every feature uses to notify a user: persists the row and
// pushes it over the socket in one call. Self-notifications are dropped.
export async function createNotification(input: {
  recipientId: string;
  senderId: string;
  type: NotificationType;
  targetId?: string;
  targetType?: NotificationTargetType;
}) {
  if (input.recipientId === input.senderId) return null;

  const notification = await prisma.notification.create({
    data: {
      recipientId: input.recipientId,
      senderId: input.senderId,
      type: input.type,
      targetId: input.targetId,
      targetType: input.targetType,
    },
    include: {
      sender: { select: { id: true, username: true, fullName: true, avatarUrl: true, isVerified: true } },
    },
  });

  emitToUser(input.recipientId, 'new_notification', notification);
  return notification;
}

// Notify all @mentioned usernames found in a piece of text.
export async function notifyMentions(input: {
  usernames: string[];
  senderId: string;
  type: NotificationType;
  targetId: string;
  targetType: NotificationTargetType;
}) {
  if (input.usernames.length === 0) return;
  const users = await prisma.user.findMany({
    where: { username: { in: input.usernames }, isActive: true },
    select: { id: true },
  });
  await Promise.all(
    users.map((u) =>
      createNotification({
        recipientId: u.id,
        senderId: input.senderId,
        type: input.type,
        targetId: input.targetId,
        targetType: input.targetType,
      })
    )
  );
}
