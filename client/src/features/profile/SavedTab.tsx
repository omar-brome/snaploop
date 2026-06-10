import { FormEvent, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bookmark, ChevronLeft, FolderPlus, Pencil, Trash2 } from 'lucide-react';
import { toast } from '../../stores/uiStore';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { GridSkeleton, Skeleton } from '../../components/ui/Skeleton';
import { Spinner } from '../../components/ui/Spinner';
import { PostGrid } from '../explore/PostGrid';
import { errorMessage, profileApi, type ProfileCollection } from './api';
import { useInfiniteList } from './hooks';

const SAVED_KEY = ['saved'] as const;
const COLLECTIONS_KEY = ['collections'] as const;

/** Own-profile Saved tab: all saved posts + collections strip + collection view. */
export function SavedTab() {
  const [active, setActive] = useState<ProfileCollection | null>(null);

  if (active) return <CollectionView collection={active} onBack={() => setActive(null)} />;
  return <AllSaved onOpenCollection={setActive} />;
}

function AllSaved({ onOpenCollection }: { onOpenCollection: (c: ProfileCollection) => void }) {
  const saved = useInfiniteList(SAVED_KEY, (cursor) => profileApi.saved(cursor));

  return (
    <div>
      <p className="px-4 py-3 text-xs text-muted-light dark:text-muted-dark">
        Only you can see what you've saved.
      </p>

      <CollectionsStrip onOpenCollection={onOpenCollection} />

      {saved.query.isLoading && <GridSkeleton />}
      {saved.query.isError && (
        <EmptyState
          icon={Bookmark}
          title="Couldn't load saved posts"
          body={errorMessage(saved.query.error)}
          action={
            <Button variant="secondary" onClick={() => void saved.query.refetch()}>
              Retry
            </Button>
          }
        />
      )}
      {saved.query.isSuccess && (
        <PostGrid
          posts={saved.items}
          onEndReached={saved.onEndReached}
          emptyState={
            <EmptyState
              icon={Bookmark}
              title="Save"
              body="Save photos and videos that you want to see again. No one is notified, and only you can see what you've saved."
            />
          }
        />
      )}
      {saved.query.isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <Spinner size={24} />
        </div>
      )}
    </div>
  );
}

function CollectionsStrip({
  onOpenCollection,
}: {
  onOpenCollection: (c: ProfileCollection) => void;
}) {
  const queryClient = useQueryClient();
  const { items, query, onEndReached } = useInfiniteList(COLLECTIONS_KEY, (cursor) =>
    profileApi.collections(cursor)
  );
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="px-4 pb-4">
      <div
        className="scrollbar-none flex gap-3 overflow-x-auto"
        role="list"
        aria-label="Collections"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 200) onEndReached();
        }}
      >
        <div role="listitem" className="w-28 shrink-0">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            aria-label="Create a new collection"
            className="flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-neutral-400 text-neutral-500 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-400 dark:hover:bg-neutral-900"
          >
            <FolderPlus size={22} aria-hidden />
            <span className="text-xs font-semibold">New</span>
          </button>
        </div>

        {query.isLoading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="w-28 shrink-0" aria-hidden>
              <Skeleton className="aspect-square rounded-lg" />
            </div>
          ))}

        {items.map((c) => (
          <div role="listitem" key={c.id} className="w-28 shrink-0">
            <button
              type="button"
              onClick={() => onOpenCollection(c)}
              aria-label={`Open collection ${c.name}`}
              className="block w-full text-left"
            >
              <span className="relative block aspect-square overflow-hidden rounded-lg bg-neutral-200 dark:bg-neutral-800">
                {c.coverUrl ? (
                  <img src={c.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-neutral-400">
                    <Bookmark size={22} aria-hidden />
                  </span>
                )}
                <span
                  className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/50 to-transparent"
                  aria-hidden
                />
                <span className="absolute bottom-1.5 left-2 right-2 truncate text-xs font-semibold text-white">
                  {c.name}
                </span>
              </span>
            </button>
          </div>
        ))}
      </div>

      <CollectionNameModal
        open={createOpen}
        title="New collection"
        confirmLabel="Create"
        onClose={() => setCreateOpen(false)}
        onSubmit={async (name) => {
          await profileApi.createCollection(name);
          queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
          toast('Collection created');
        }}
      />
    </div>
  );
}

function CollectionView({
  collection,
  onBack,
}: {
  collection: ProfileCollection;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(collection.name);
  const [renameOpen, setRenameOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { items, query, onEndReached } = useInfiniteList(
    ['collection-posts', collection.id],
    (cursor) => profileApi.collectionPosts(collection.id, cursor)
  );

  const deleteMutation = useMutation({
    mutationFn: () => profileApi.deleteCollection(collection.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
      queryClient.invalidateQueries({ queryKey: SAVED_KEY });
      toast('Collection deleted');
      onBack();
    },
    onError: (err) => toast(errorMessage(err, 'Could not delete the collection'), 'error'),
  });

  return (
    <div>
      <div className="flex items-center gap-2 px-2 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to all saved posts"
          className="rounded-full p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <ChevronLeft size={22} />
        </button>
        <h3 className="min-w-0 flex-1 truncate text-base font-semibold">{name}</h3>
        <button
          type="button"
          onClick={() => setRenameOpen(true)}
          aria-label="Rename collection"
          className="rounded-full p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <Pencil size={18} />
        </button>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          aria-label="Delete collection"
          className="rounded-full p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
        >
          <Trash2 size={18} />
        </button>
      </div>

      {query.isLoading && <GridSkeleton />}
      {query.isError && (
        <EmptyState
          icon={Bookmark}
          title="Couldn't load this collection"
          body={errorMessage(query.error)}
          action={
            <Button variant="secondary" onClick={() => void query.refetch()}>
              Retry
            </Button>
          }
        />
      )}
      {query.isSuccess && (
        <PostGrid
          posts={items}
          onEndReached={onEndReached}
          emptyState={
            <EmptyState
              icon={Bookmark}
              title="No posts yet"
              body="Save posts to this collection and they'll show up here."
            />
          }
        />
      )}
      {query.isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <Spinner size={24} />
        </div>
      )}

      <CollectionNameModal
        open={renameOpen}
        title="Rename collection"
        confirmLabel="Save"
        initialName={name}
        onClose={() => setRenameOpen(false)}
        onSubmit={async (newName) => {
          await profileApi.renameCollection(collection.id, newName);
          setName(newName);
          queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
          toast('Collection renamed');
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => deleteMutation.mutate()}
        title={`Delete "${name}"?`}
        body="The collection will be removed. Posts in it stay saved."
        confirmLabel="Delete"
      />
    </div>
  );
}

/** Shared create/rename dialog: single name field + submit. */
function CollectionNameModal({
  open,
  title,
  confirmLabel,
  initialName = '',
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  confirmLabel: string;
  initialName?: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);

  // Re-seed the field each time the dialog opens.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(initialName);
      setSaving(false);
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean || saving) return;
    setSaving(true);
    try {
      await onSubmit(clean);
      onClose();
    } catch (err) {
      toast(errorMessage(err, 'Could not save the collection'), 'error');
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} className="max-w-sm">
      <form onSubmit={handleSubmit} className="space-y-4 p-4">
        <Input
          label="Name"
          name="collection-name"
          value={name}
          maxLength={50}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          placeholder="Collection name"
          disabled={saving}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving} disabled={saving || !name.trim()}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
