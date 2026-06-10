import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Bell, ChevronLeft, KeyRound, Lock, Moon, ShieldAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { toast, useUiStore } from '../stores/uiStore';
import { changePassword, logout } from '../services/auth';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Input } from '../components/ui/Input';
import { Skeleton } from '../components/ui/Skeleton';
import { Spinner } from '../components/ui/Spinner';
import {
  errorMessage,
  profileApi,
  type NotificationPreferences,
} from '../features/profile/api';
import { useEndReached, useInfiniteList } from '../features/profile/hooks';
import { Toggle } from '../features/profile/Toggle';

export default function SettingsPage() {
  const me = useAuthStore((s) => s.user);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-4 md:pt-8">
      <div className="mb-6 flex items-center gap-2">
        <Link
          to={me ? `/${me.username}` : '/'}
          aria-label="Back to your profile"
          className="rounded-full p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <ChevronLeft size={22} aria-hidden />
        </Link>
        <h1 className="text-xl font-bold">Settings</h1>
      </div>

      <div className="space-y-6">
        <ChangePasswordSection />
        <PrivacySection />
        <AppearanceSection />
        <NotificationPreferencesSection />
        <BlockedAccountsSection />
        <DeactivateSection />
      </div>
    </main>
  );
}

/** Shared card chrome: icon + heading + content. */
function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const headingId = `settings-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-2xl border border-border-light p-4 md:p-5 dark:border-border-dark"
    >
      <div className="mb-1 flex items-center gap-2.5">
        <Icon size={18} aria-hidden className="shrink-0" />
        <h2 id={headingId} className="text-base font-semibold">
          {title}
        </h2>
      </div>
      {description && (
        <p className="mb-3 text-xs text-muted-light dark:text-muted-dark">{description}</p>
      )}
      <div className={description ? undefined : 'mt-3'}>{children}</div>
    </section>
  );
}

// ---- Change password ----

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().min(8, 'At least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

type PasswordValues = z.infer<typeof passwordSchema>;

function ChangePasswordSection() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema) });

  const onSubmit = async (values: PasswordValues) => {
    try {
      await changePassword(values.currentPassword, values.newPassword);
      reset();
      toast('Password changed');
    } catch (err) {
      toast(errorMessage(err, 'Could not change your password'), 'error');
    }
  };

  return (
    <Section icon={KeyRound} title="Change password">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
        <Input
          label="Current password"
          type="password"
          autoComplete="current-password"
          {...register('currentPassword')}
          error={errors.currentPassword?.message}
        />
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          {...register('newPassword')}
          error={errors.newPassword?.message}
        />
        <Input
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          {...register('confirmPassword')}
          error={errors.confirmPassword?.message}
        />
        <div className="flex justify-end">
          <Button type="submit" loading={isSubmitting}>
            Change password
          </Button>
        </div>
      </form>
    </Section>
  );
}

// ---- Privacy ----

function PrivacySection() {
  const me = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (isPrivate: boolean) => profileApi.updateMe({ isPrivate }),
    onSuccess: (updated, isPrivate) => {
      if (me) setUser({ ...me, ...updated });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast(isPrivate ? 'Your account is now private' : 'Your account is now public');
    },
    onError: (err) => toast(errorMessage(err, 'Could not update privacy'), 'error'),
  });

  return (
    <Section
      icon={Lock}
      title="Account privacy"
      description="When your account is private, only followers you approve can see your photos and videos."
    >
      <div className="flex items-center justify-between gap-4">
        <label htmlFor="settings-private-toggle" className="text-sm font-medium">
          Private account
        </label>
        <Toggle
          id="settings-private-toggle"
          checked={me?.isPrivate ?? false}
          disabled={mutation.isPending}
          onChange={(checked) => mutation.mutate(checked)}
          label="Private account"
        />
      </div>
    </Section>
  );
}

// ---- Appearance ----

function AppearanceSection() {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  return (
    <Section icon={Moon} title="Appearance">
      <div className="flex items-center justify-between gap-4">
        <label htmlFor="settings-dark-toggle" className="text-sm font-medium">
          Dark mode
        </label>
        <Toggle
          id="settings-dark-toggle"
          checked={theme === 'dark'}
          onChange={(checked) => setTheme(checked ? 'dark' : 'light')}
          label="Dark mode"
        />
      </div>
    </Section>
  );
}

// ---- Notification preferences ----

const PREFS_KEY = ['notification-preferences'] as const;

const PREF_LABELS: Record<string, string> = {
  FOLLOW: 'New followers',
  FOLLOW_REQUEST: 'Follow requests',
  FOLLOW_ACCEPTED: 'Accepted follow requests',
  LIKE_POST: 'Likes on your posts',
  LIKE_REEL: 'Likes on your reels',
  LIKE_COMMENT: 'Likes on your comments',
  COMMENT_POST: 'Comments on your posts',
  COMMENT_REEL: 'Comments on your reels',
  COMMENT_REPLY: 'Replies to your comments',
  MENTION_COMMENT: 'Mentions in comments',
  MENTION_CAPTION: 'Mentions in captions',
  TAGGED_IN_POST: 'Tags in posts',
  MESSAGE: 'Messages',
};

function prefLabel(type: string): string {
  if (PREF_LABELS[type]) return PREF_LABELS[type];
  const words = type.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function NotificationPreferencesSection() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: PREFS_KEY,
    queryFn: profileApi.notificationPreferences,
  });

  // Optimistic per-switch update with rollback.
  const update = useMutation({
    mutationFn: (updates: NotificationPreferences) =>
      profileApi.updateNotificationPreferences(updates),
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: PREFS_KEY });
      const prev = queryClient.getQueryData<NotificationPreferences>(PREFS_KEY);
      queryClient.setQueryData<NotificationPreferences>(PREFS_KEY, (old) =>
        old ? { ...old, ...updates } : old
      );
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(PREFS_KEY, ctx.prev);
      toast(errorMessage(err, 'Could not update notifications'), 'error');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PREFS_KEY });
    },
  });

  const prefs = query.data;
  const entries = prefs ? Object.entries(prefs) : [];

  return (
    <Section
      icon={Bell}
      title="Notifications"
      description="Choose which notifications you want to receive."
    >
      {query.isLoading && (
        <div className="space-y-3" aria-hidden>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <Skeleton className="h-3.5 w-44" />
              <Skeleton className="h-6 w-11 rounded-full" />
            </div>
          ))}
        </div>
      )}
      {query.isError && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-light dark:text-muted-dark">
            Couldn't load your notification settings.
          </p>
          <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {query.isSuccess && entries.length === 0 && (
        <p className="text-sm text-muted-light dark:text-muted-dark">
          No notification settings available.
        </p>
      )}
      {query.isSuccess && entries.length > 0 && (
        <ul className="space-y-3">
          {entries.map(([type, enabled]) => {
            const id = `pref-${type.toLowerCase()}`;
            return (
              <li key={type} className="flex items-center justify-between gap-4">
                <label htmlFor={id} className="text-sm">
                  {prefLabel(type)}
                </label>
                <Toggle
                  id={id}
                  checked={enabled}
                  onChange={(checked) => update.mutate({ [type]: checked })}
                  label={prefLabel(type)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

// ---- Blocked accounts ----

const BLOCKED_KEY = ['blocked'] as const;

function BlockedAccountsSection() {
  const queryClient = useQueryClient();
  const { items, query, onEndReached } = useInfiniteList(BLOCKED_KEY, (cursor) =>
    profileApi.blockedUsers(cursor)
  );
  const sentinelRef = useEndReached(onEndReached);

  const unblock = useMutation({
    mutationFn: (username: string) => profileApi.unblock(username),
    onSuccess: (_data, username) => {
      toast(`Unblocked @${username}`);
      queryClient.invalidateQueries({ queryKey: BLOCKED_KEY });
      queryClient.invalidateQueries({ queryKey: ['profile', username] });
    },
    onError: (err) => toast(errorMessage(err, 'Could not unblock'), 'error'),
  });

  return (
    <Section
      icon={Ban}
      title="Blocked accounts"
      description="Blocked people can't find your profile, posts or stories."
    >
      {query.isLoading && (
        <div className="space-y-2" aria-hidden>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-1.5">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-2.5 w-20" />
              </div>
            </div>
          ))}
        </div>
      )}
      {query.isError && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-light dark:text-muted-dark">
            Couldn't load blocked accounts.
          </p>
          <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {query.isSuccess && items.length === 0 && (
        <p className="text-sm text-muted-light dark:text-muted-dark">
          You haven't blocked anyone.
        </p>
      )}
      {query.isSuccess && items.length > 0 && (
        <ul aria-label="Blocked accounts">
          {items.map((u) => (
            <li key={u.id} className="flex items-center gap-3 py-1.5">
              <Link to={`/${u.username}`} className="shrink-0">
                <Avatar src={u.avatarUrl} alt={u.username} size={40} />
              </Link>
              <Link to={`/${u.username}`} className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{u.username}</span>
                <span className="block truncate text-xs text-muted-light dark:text-muted-dark">
                  {u.fullName}
                </span>
              </Link>
              <Button
                size="sm"
                variant="secondary"
                disabled={unblock.isPending}
                onClick={() => unblock.mutate(u.username)}
                aria-label={`Unblock ${u.username}`}
              >
                Unblock
              </Button>
            </li>
          ))}
          {query.isFetchingNextPage && (
            <li className="flex justify-center py-2">
              <Spinner size={18} />
            </li>
          )}
          <li ref={sentinelRef} className="h-px" aria-hidden />
        </ul>
      )}
    </Section>
  );
}

// ---- Deactivate ----

function DeactivateSection() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const deactivate = useMutation({
    mutationFn: () => profileApi.deactivateAccount(password),
    onSuccess: async () => {
      await logout();
      navigate('/login', { replace: true });
    },
    onError: (err) => toast(errorMessage(err, 'Could not deactivate your account'), 'error'),
  });

  return (
    <Section
      icon={ShieldAlert}
      title="Deactivate account"
      description="Your profile, posts and comments will be hidden until you log back in."
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (password) setConfirmOpen(true);
        }}
      >
        <Input
          label="Confirm with your password"
          name="deactivate-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={deactivate.isPending}
        />
        <div className="flex justify-end">
          <Button
            type="submit"
            variant="danger"
            loading={deactivate.isPending}
            disabled={!password || deactivate.isPending}
          >
            Deactivate account
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => deactivate.mutate()}
        title="Deactivate your account?"
        body="You'll be logged out and your account will be hidden until you log in again."
        confirmLabel="Deactivate"
      />
    </Section>
  );
}
