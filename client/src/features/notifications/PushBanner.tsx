import { useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import {
  dismissPushBanner,
  pushBannerDismissed,
  pushPermission,
  pushSupported,
  requestPushPermission,
} from './push';

// Small dismissible prompt to enable browser notifications. Dismissal is
// remembered in localStorage; the banner also disappears once permission is
// no longer 'default' (granted or denied).

export function PushBanner() {
  const [visible, setVisible] = useState(
    () => pushSupported() && pushPermission() === 'default' && !pushBannerDismissed()
  );
  const [requesting, setRequesting] = useState(false);

  if (!visible) return null;

  const turnOn = async () => {
    setRequesting(true);
    try {
      await requestPushPermission();
    } finally {
      // Whatever the user picked, permission left 'default' — banner is done.
      setVisible(false);
    }
  };

  const dismiss = () => {
    dismissPushBanner();
    setVisible(false);
  };

  return (
    <div
      role="region"
      aria-label="Enable push notifications"
      className="mx-4 mb-2 flex items-center gap-3 rounded-xl border border-border-light bg-elevated-light px-3.5 py-2.5 dark:border-border-dark dark:bg-elevated-dark md:mx-0"
    >
      <BellRing size={20} className="shrink-0 text-primary" aria-hidden />
      <p className="flex-1 text-sm">Get notified when people like or comment, even when Snaploop is in the background.</p>
      <Button variant="text" size="sm" loading={requesting} onClick={() => void turnOn()} className="shrink-0 text-sm">
        Turn on
      </Button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss push notifications prompt"
        className="shrink-0 rounded-full p-1 text-muted-light transition-colors hover:bg-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary dark:text-muted-dark dark:hover:bg-neutral-800"
      >
        <X size={16} />
      </button>
    </div>
  );
}
