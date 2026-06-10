import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { Avatar } from '../../components/ui/Avatar';
import { Modal } from '../../components/ui/Modal';
import { StoryTraySkeleton } from '../../components/ui/Skeleton';
import { fetchStoryTray } from './api';
import { StoryComposer } from './StoryComposer';
import { StoryViewer } from './StoryViewer';

/**
 * Horizontal story tray: "Your story" first (plus badge → composer), then
 * followed users with active stories — gradient ring while unseen, gray once
 * all seen. Clicking a circle opens the fullscreen StoryViewer.
 */
export function StoryTray() {
  const me = useAuthStore((s) => s.user);
  const { data, isLoading } = useQuery({ queryKey: ['stories', 'tray'], queryFn: fetchStoryTray });

  const [viewerUser, setViewerUser] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  if (isLoading) return <StoryTraySkeleton />;

  const items = data ?? [];
  const selfItem = me ? items.find((item) => item.user.id === me.id) : undefined;
  const others = me ? items.filter((item) => item.user.id !== me.id) : items;

  return (
    <>
      <div
        className="scrollbar-none flex gap-4 overflow-x-auto px-4 py-3"
        role="list"
        aria-label="Stories"
      >
        {me && (
          <div className="flex w-16 shrink-0 flex-col items-center gap-1" role="listitem">
            <div className="relative">
              <button
                type="button"
                onClick={() =>
                  selfItem ? setViewerUser(me.username) : setComposerOpen(true)
                }
                aria-label={selfItem ? 'View your story' : 'Add to your story'}
                className="flex h-16 w-16 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <Avatar
                  src={me.avatarUrl}
                  alt={me.username}
                  size={56}
                  ring={selfItem ? (selfItem.allViewed ? 'seen' : 'story') : 'none'}
                />
              </button>
              <button
                type="button"
                onClick={() => setComposerOpen(true)}
                aria-label="Create a new story"
                className="absolute bottom-0 right-0 z-10 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-primary text-white dark:border-black"
              >
                <Plus size={12} strokeWidth={3} aria-hidden />
              </button>
            </div>
            <span className="w-full truncate text-center text-xs text-muted-light dark:text-muted-dark">
              Your story
            </span>
          </div>
        )}

        {others.map((item) => (
          <div key={item.user.id} className="flex w-16 shrink-0 flex-col items-center gap-1" role="listitem">
            <button
              type="button"
              onClick={() => setViewerUser(item.user.username)}
              aria-label={`View ${item.user.username}'s ${item.allViewed ? 'seen ' : ''}story`}
              className="flex h-16 w-16 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Avatar
                src={item.user.avatarUrl}
                alt={item.user.username}
                size={56}
                ring={item.allViewed ? 'seen' : 'story'}
              />
            </button>
            <span className="w-full truncate text-center text-xs">{item.user.username}</span>
          </div>
        ))}
      </div>

      {viewerUser && <StoryViewer username={viewerUser} onClose={() => setViewerUser(null)} />}

      <Modal
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        title="New story"
        className="max-w-2xl"
      >
        <div className="p-4">
          <StoryComposer onDone={() => setComposerOpen(false)} />
        </div>
      </Modal>
    </>
  );
}
