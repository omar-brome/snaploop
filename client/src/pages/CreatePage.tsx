import { KeyboardEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { StoryComposer } from '../features/stories/StoryComposer';
import { ReelComposer } from '../features/reels/ReelComposer';
import { PostComposer } from '../features/upload/PostComposer';
import { cn } from '../utils/cn';

type CreateTab = 'post' | 'story' | 'reel';

const TABS: { id: CreateTab; label: string }[] = [
  { id: 'post', label: 'Post' },
  { id: 'story', label: 'Story' },
  { id: 'reel', label: 'Reel' },
];

// Create hub: segmented Post / Story / Reel tabs synced to ?tab=. Post renders
// the upload orchestrator; Story and Reel reuse their feature composers.
export default function CreatePage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const raw = params.get('tab');
  const tab: CreateTab = raw === 'story' || raw === 'reel' ? raw : 'post';

  const setTab = (next: CreateTab) => {
    setParams(next === 'post' ? {} : { tab: next }, { replace: true });
  };

  // Roving arrow-key navigation per the ARIA tabs pattern.
  const onTablistKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const idx = TABS.findIndex((t) => t.id === tab);
    const next = TABS[(idx + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length].id;
    setTab(next);
    document.getElementById(`create-tab-${next}`)?.focus();
  };

  return (
    <div className="mx-auto w-full max-w-4xl md:px-6 md:py-8">
      <div className="min-h-[calc(100vh-7rem)] bg-white dark:bg-black md:min-h-0 md:overflow-hidden md:rounded-2xl md:border md:border-border-light md:dark:border-border-dark">
        <div className="flex items-center justify-center border-b border-border-light px-4 py-3 dark:border-border-dark">
          <h1 className="sr-only">Create</h1>
          <div
            role="tablist"
            aria-label="What to create"
            onKeyDown={onTablistKeyDown}
            className="flex rounded-full bg-neutral-100 p-1 dark:bg-neutral-900"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                id={`create-tab-${t.id}`}
                role="tab"
                aria-selected={tab === t.id}
                aria-controls={`create-panel-${t.id}`}
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => setTab(t.id)}
                className={cn(
                  'rounded-full px-5 py-1.5 text-sm font-semibold transition-colors',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
                  tab === t.id
                    ? 'bg-white shadow dark:bg-neutral-700'
                    : 'text-muted-light hover:text-current dark:text-muted-dark'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div
          key={tab}
          id={`create-panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`create-tab-${tab}`}
        >
          {tab === 'post' && <PostComposer onDone={() => navigate('/')} />}
          {tab === 'story' && (
            <div className="px-4 py-4">
              <StoryComposer onDone={() => navigate('/')} />
            </div>
          )}
          {tab === 'reel' && (
            <div className="px-4 py-4">
              <ReelComposer onDone={() => navigate('/reels')} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
