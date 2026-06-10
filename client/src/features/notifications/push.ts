import { getSocket } from '../../services/socket';
import type { Notification as SnaploopNotification } from '../../types';
import { actionText } from './notificationUtils';

// Browser push (Notification API). A single module-level socket listener
// shows a local notification for events that arrive while the tab is hidden.
// Initialized from NotificationsPage; idempotent.

const DISMISS_KEY = 'snaploop-push-dismissed';

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function pushPermission(): NotificationPermission {
  return pushSupported() ? Notification.permission : 'denied';
}

export function pushBannerDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissPushBanner(): void {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // Storage unavailable (private mode) — banner just reappears next visit.
  }
}

let listening = false;

function onNewNotification(n: SnaploopNotification): void {
  if (!document.hidden || pushPermission() !== 'granted') return;
  try {
    // eslint-disable-next-line no-new -- side-effectful constructor is the Notification API
    new Notification(n.sender.username, {
      body: actionText(n.type),
      icon: n.sender.avatarUrl ?? undefined,
      tag: n.id,
    });
  } catch {
    // Some platforms throw from the constructor (e.g. Android Chrome).
  }
}

export function initPushNotifications(): void {
  if (listening || pushPermission() !== 'granted') return;
  const socket = getSocket();
  if (!socket) return; // not connected yet — caller may retry later
  socket.on('new_notification', onNewNotification);
  listening = true;
}

export async function requestPushPermission(): Promise<boolean> {
  if (!pushSupported()) return false;
  const result = await Notification.requestPermission();
  if (result !== 'granted') return false;
  initPushNotifications();
  return true;
}
