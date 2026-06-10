import { ReactNode, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Link2, MoreHorizontal, Settings } from 'lucide-react';
import type { Profile } from '../../types';
import { toast } from '../../stores/uiStore';
import { useFollow } from '../../hooks/useFollow';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Modal } from '../../components/ui/Modal';
import { RichText } from '../../components/RichText';
import { formatCount } from '../../utils/timeAgo';
import { StoryViewer } from '../stories/StoryViewer';
import { errorMessage, profileApi } from './api';
import { FollowListModal } from './FollowListModal';

const REPORT_REASONS = [
  'Spam',
  'Inappropriate content',
  'Harassment or bullying',
  'Impersonation',
  'Something else',
] as const;

function externalUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export function ProfileHeader({ profile }: { profile: Profile }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isOwn = profile.isOwnProfile;

  // Story ring: shown when this user appears in the stories tray (shared
  // cache key with the home StoryTray).
  const { data: tray } = useQuery({
    queryKey: ['stories', 'tray'],
    queryFn: profileApi.storyTray,
    staleTime: 60_000,
  });
  const trayItem = tray?.find(
    (t) => t.user.username.toLowerCase() === profile.username.toLowerCase()
  );
  const [storyOpen, setStoryOpen] = useState(false);

  // Follow / unfollow (optimistic against the ['profile', username] cache).
  const follow = useFollow(profile.username);
  const [confirmUnfollow, setConfirmUnfollow] = useState(false);

  const message = useMutation({
    mutationFn: () => profileApi.startConversation(profile.id),
    onSuccess: (conversation) => navigate(`/messages/${conversation.id}`),
    onError: (err) => toast(errorMessage(err, 'Could not open the conversation'), 'error'),
  });

  // More menu: block / report / share.
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const block = useMutation({
    mutationFn: (blocked: boolean) =>
      blocked ? profileApi.unblock(profile.username) : profileApi.block(profile.username),
    onSuccess: (_data, blocked) => {
      toast(blocked ? `Unblocked @${profile.username}` : `Blocked @${profile.username}`);
      queryClient.invalidateQueries({ queryKey: ['profile', profile.username] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['blocked'] });
    },
    onError: (err) => toast(errorMessage(err, 'Action failed'), 'error'),
  });

  const report = useMutation({
    mutationFn: (reason: string) => profileApi.reportUser(profile.id, reason),
    onSuccess: () => {
      setReportOpen(false);
      toast('Thanks for letting us know');
    },
    onError: (err) => toast(errorMessage(err, 'Could not send the report'), 'error'),
  });

  const shareProfile = async () => {
    setMenuOpen(false);
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/${profile.username}`);
      toast('Profile link copied');
    } catch {
      toast('Could not copy the link', 'error');
    }
  };

  // Followers / following modals.
  const [listType, setListType] = useState<'followers' | 'following' | null>(null);

  const followLabel =
    profile.followStatus === 'accepted'
      ? 'Following'
      : profile.followStatus === 'pending'
        ? 'Requested'
        : profile.followsMe
          ? 'Follow back'
          : 'Follow';

  const handleFollowClick = () => {
    if (profile.followStatus === 'accepted') setConfirmUnfollow(true);
    else if (profile.followStatus === 'pending') follow.mutate({ follow: false });
    else follow.mutate({ follow: true });
  };

  const renderAvatar = (size: number) => {
    const img = (
      <Avatar
        src={profile.avatarUrl}
        alt={profile.username}
        size={size}
        ring={trayItem ? (trayItem.allViewed ? 'seen' : 'story') : 'none'}
      />
    );
    if (!trayItem) return img;
    return (
      <button
        type="button"
        onClick={() => setStoryOpen(true)}
        aria-label={`View ${profile.username}'s story`}
        className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {img}
      </button>
    );
  };

  const actionButtons = isOwn ? (
    <>
      <Button
        variant="secondary"
        size="sm"
        className="flex-1 md:flex-none"
        onClick={() => navigate('/accounts/edit')}
      >
        Edit profile
      </Button>
      <Link
        to="/accounts/settings"
        aria-label="Settings"
        className="flex items-center justify-center rounded-lg bg-neutral-100 px-3 py-1.5 transition-colors hover:bg-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:bg-neutral-800 dark:hover:bg-neutral-700"
      >
        <Settings size={18} aria-hidden />
      </Link>
    </>
  ) : (
    <>
      <Button
        size="sm"
        variant={profile.followStatus === 'none' ? 'primary' : 'secondary'}
        loading={follow.isPending}
        onClick={handleFollowClick}
        className="flex-1 md:flex-none"
        aria-pressed={profile.followStatus !== 'none'}
      >
        {followLabel}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        loading={message.isPending}
        onClick={() => message.mutate()}
        className="flex-1 md:flex-none"
      >
        Message
      </Button>
      <Button
        size="sm"
        variant="secondary"
        aria-label="More options"
        aria-haspopup="dialog"
        onClick={() => setMenuOpen(true)}
        className="px-2"
      >
        <MoreHorizontal size={18} aria-hidden />
      </Button>
    </>
  );

  const nameAndBio = (
    <>
      {profile.fullName && <p className="text-sm font-semibold">{profile.fullName}</p>}
      {profile.bio && (
        <RichText text={profile.bio} className="block whitespace-pre-wrap text-sm" />
      )}
      {profile.websiteUrl && (
        <a
          href={externalUrl(profile.websiteUrl)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex max-w-full items-center gap-1 text-sm font-semibold text-[#00376b] hover:underline dark:text-[#e0f1ff]"
        >
          <Link2 size={14} aria-hidden className="shrink-0" />
          <span className="truncate">{profile.websiteUrl.replace(/^https?:\/\//i, '')}</span>
        </a>
      )}
    </>
  );

  return (
    <header aria-label={`${profile.username}'s profile`}>
      <div className="flex items-center gap-5 px-4 pt-5 md:items-start md:gap-12 md:px-8 md:pt-8">
        <div className="shrink-0 md:hidden">{renderAvatar(86)}</div>
        <div className="hidden shrink-0 md:block">{renderAvatar(150)}</div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <h1 className="flex min-w-0 items-center gap-1.5 text-xl">
              <span className="truncate">{profile.username}</span>
              {profile.isVerified && (
                <BadgeCheck
                  size={18}
                  aria-label="Verified"
                  className="shrink-0 fill-primary text-white dark:text-black"
                />
              )}
            </h1>
            <div className="hidden items-center gap-2 md:flex">{actionButtons}</div>
          </div>

          {/* Desktop stats inline */}
          <div className="mt-5 hidden items-center gap-10 md:flex">
            <Stat value={profile.postCount} label="posts" />
            <Stat
              value={profile.followerCount}
              label="followers"
              onClick={() => setListType('followers')}
            />
            <Stat
              value={profile.followingCount}
              label="following"
              onClick={() => setListType('following')}
            />
          </div>

          <div className="mt-4 hidden space-y-1 md:block">{nameAndBio}</div>
        </div>
      </div>

      {/* Mobile: buttons row, then bio, then a full-width centered stats row */}
      <div className="mt-4 flex items-center gap-2 px-4 md:hidden">{actionButtons}</div>
      <div className="mt-3 space-y-1 px-4 md:hidden">{nameAndBio}</div>
      <div className="mt-4 grid grid-cols-3 border-y border-border-light py-2.5 text-center md:hidden dark:border-border-dark">
        <MobileStat value={profile.postCount} label="posts" />
        <MobileStat
          value={profile.followerCount}
          label="followers"
          onClick={() => setListType('followers')}
        />
        <MobileStat
          value={profile.followingCount}
          label="following"
          onClick={() => setListType('following')}
        />
      </div>

      {/* Story viewer */}
      {storyOpen && (
        <StoryViewer username={profile.username} onClose={() => setStoryOpen(false)} />
      )}

      {/* Followers / following lists */}
      {listType && (
        <FollowListModal
          username={profile.username}
          type={listType}
          open
          onClose={() => setListType(null)}
        />
      )}

      {/* Unfollow confirmation */}
      <ConfirmDialog
        open={confirmUnfollow}
        onClose={() => setConfirmUnfollow(false)}
        onConfirm={() => follow.mutate({ follow: false })}
        title={`Unfollow @${profile.username}?`}
        body={
          profile.isPrivate
            ? "You'll have to request to follow them again."
            : undefined
        }
        confirmLabel="Unfollow"
      />

      {/* More options sheet */}
      <Modal
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        variant="sheet"
        showClose={false}
        title={`Options for ${profile.username}`}
        className="max-w-sm"
      >
        <div className="flex flex-col divide-y divide-border-light text-center dark:divide-border-dark">
          <SheetButton
            destructive
            onClick={() => {
              setMenuOpen(false);
              setConfirmBlock(true);
            }}
          >
            {profile.isBlocked ? 'Unblock' : 'Block'}
          </SheetButton>
          <SheetButton
            destructive
            onClick={() => {
              setMenuOpen(false);
              setReportOpen(true);
            }}
          >
            Report
          </SheetButton>
          <SheetButton onClick={() => void shareProfile()}>Share profile</SheetButton>
          <SheetButton onClick={() => setMenuOpen(false)}>Cancel</SheetButton>
        </div>
      </Modal>

      {/* Block confirmation */}
      <ConfirmDialog
        open={confirmBlock}
        onClose={() => setConfirmBlock(false)}
        onConfirm={() => block.mutate(profile.isBlocked)}
        title={
          profile.isBlocked
            ? `Unblock @${profile.username}?`
            : `Block @${profile.username}?`
        }
        body={
          profile.isBlocked
            ? "They'll be able to see your posts and follow you again."
            : "They won't be able to find your profile or posts. They won't be notified."
        }
        confirmLabel={profile.isBlocked ? 'Unblock' : 'Block'}
      />

      {/* Report sheet */}
      <Modal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        variant="sheet"
        title="Report"
        className="max-w-sm"
      >
        <p className="px-4 pt-3 text-sm font-semibold">
          Why are you reporting @{profile.username}?
        </p>
        <div className="mt-2 flex flex-col divide-y divide-border-light dark:divide-border-dark">
          {REPORT_REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              disabled={report.isPending}
              onClick={() => report.mutate(reason)}
              className="px-4 py-3 text-left text-sm hover:bg-neutral-50 disabled:opacity-50 dark:hover:bg-neutral-800"
            >
              {reason}
            </button>
          ))}
        </div>
      </Modal>

    </header>
  );
}

function Stat({ value, label, onClick }: { value: number; label: string; onClick?: () => void }) {
  const content = (
    <>
      <span className="font-semibold">{formatCount(value)}</span> {label}
    </>
  );
  if (!onClick) {
    return <span className="text-base">{content}</span>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-base hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      aria-label={`${formatCount(value)} ${label} — open list`}
    >
      {content}
    </button>
  );
}

function MobileStat({
  value,
  label,
  onClick,
}: {
  value: number;
  label: string;
  onClick?: () => void;
}) {
  const inner = (
    <span className="flex flex-col items-center">
      <span className="text-sm font-semibold">{formatCount(value)}</span>
      <span className="text-xs text-muted-light dark:text-muted-dark">{label}</span>
    </span>
  );
  if (!onClick) return inner;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${formatCount(value)} ${label} — open list`}
      className="focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
    >
      {inner}
    </button>
  );
}

function SheetButton({
  children,
  onClick,
  destructive,
}: {
  children: ReactNode;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`py-3.5 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 ${
        destructive ? 'font-bold text-red-500' : ''
      }`}
    >
      {children}
    </button>
  );
}
