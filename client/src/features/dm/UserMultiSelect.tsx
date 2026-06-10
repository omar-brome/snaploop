import { useState } from 'react';
import { X } from 'lucide-react';
import type { UserSearchResult } from '../../types';
import { useAuthStore } from '../../stores/authStore';
import { Avatar } from '../../components/ui/Avatar';
import { Skeleton } from '../../components/ui/Skeleton';
import { useDebouncedValue, useUserSearch } from './hooks';

// Debounced user search with multi-select chips. Used by the new-message
// modal and the group "add members" flow.
export function UserMultiSelect({
  selected,
  onChange,
  excludeIds = [],
  autoFocus,
}: {
  selected: UserSearchResult[];
  onChange: (users: UserSearchResult[]) => void;
  excludeIds?: string[];
  autoFocus?: boolean;
}) {
  const ownId = useAuthStore((s) => s.user?.id);
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 300);
  const { data, isFetching } = useUserSearch(debounced);

  const results = (data?.data ?? []).filter(
    (u) => u.id !== ownId && !excludeIds.includes(u.id) && !selected.some((s) => s.id === u.id)
  );

  const add = (user: UserSearchResult) => {
    onChange([...selected, user]);
    setQuery('');
  };
  const remove = (id: string) => onChange(selected.filter((u) => u.id !== id));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border-light px-4 py-3 dark:border-border-dark">
        <span className="text-sm font-semibold">To:</span>
        {selected.map((user) => (
          <span
            key={user.id}
            className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary"
          >
            {user.username}
            <button
              onClick={() => remove(user.id)}
              aria-label={`Remove ${user.username}`}
              className="rounded-full hover:bg-primary/20"
            >
              <X size={14} />
            </button>
          </span>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !query && selected.length > 0) {
              remove(selected[selected.length - 1].id);
            }
          }}
          placeholder="Search…"
          aria-label="Search people"
          autoFocus={autoFocus}
          className="min-w-[120px] flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-neutral-400"
        />
      </div>

      <div className="max-h-64 min-h-[120px] overflow-y-auto" role="listbox" aria-label="People">
        {isFetching && (
          <div className="space-y-1 px-4 py-3" aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-2.5 w-28" />
                  <Skeleton className="h-2.5 w-20" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isFetching && debounced.trim() && results.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-light dark:text-muted-dark">
            No account found.
          </p>
        )}

        {!isFetching && !debounced.trim() && (
          <p className="px-4 py-6 text-center text-sm text-muted-light dark:text-muted-dark">
            Search for people to message.
          </p>
        )}

        {!isFetching &&
          results.map((user) => (
            <button
              key={user.id}
              role="option"
              aria-selected={false}
              onClick={() => add(user)}
              className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-neutral-50 dark:hover:bg-neutral-900"
            >
              <Avatar src={user.avatarUrl} alt={user.username} size={40} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{user.username}</span>
                <span className="block truncate text-xs text-muted-light dark:text-muted-dark">
                  {user.fullName}
                </span>
              </span>
            </button>
          ))}
      </div>
    </div>
  );
}
