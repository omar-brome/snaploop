import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, UserPlus, X } from 'lucide-react';
import type { Conversation, Participant, UserSearchResult } from '../../types';
import { useAuthStore } from '../../stores/authStore';
import { toast } from '../../stores/uiStore';
import { compressImage, uploadFiles } from '../../services/upload';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { dmApi } from './api';
import { ConversationAvatar } from './ConversationAvatar';
import { UserMultiSelect } from './UserMultiSelect';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

// Group management sheet: rename, change photo, add/remove members, leave.
export function GroupInfoSheet({
  open,
  onClose,
  conversation,
}: {
  open: boolean;
  onClose: () => void;
  conversation: Conversation;
}) {
  const ownId = useAuthStore((s) => s.user?.id) ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState(conversation.groupName ?? '');
  const [addOpen, setAddOpen] = useState(false);
  const [toAdd, setToAdd] = useState<UserSearchResult[]>([]);
  const [removeTarget, setRemoveTarget] = useState<Participant | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Re-sync local edit state every time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setName(conversation.groupName ?? '');
    setAddOpen(false);
    setToAdd([]);
  }, [open, conversation.groupName]);

  const applyConversation = (updated: Conversation) => {
    queryClient.setQueryData(['conversation', updated.id], updated);
    void queryClient.invalidateQueries({ queryKey: ['conversations'] });
  };

  const rename = useMutation({
    mutationFn: () => dmApi.updateGroup(conversation.id, { groupName: name.trim() }),
    onSuccess: (updated) => {
      applyConversation(updated);
      toast('Group name updated');
    },
    onError: (err) => toast(errorMessage(err, 'Could not rename group'), 'error'),
  });

  const setAvatar = useMutation({
    mutationFn: async (file: File) => {
      const [uploaded] = await uploadFiles([await compressImage(file, 640)]);
      if (!uploaded) throw new Error('Upload failed');
      return dmApi.updateGroup(conversation.id, { groupAvatarUrl: uploaded.url });
    },
    onSuccess: applyConversation,
    onError: (err) => toast(errorMessage(err, 'Could not change group photo'), 'error'),
  });

  const add = useMutation({
    mutationFn: () =>
      dmApi.addParticipants(
        conversation.id,
        toAdd.map((u) => u.id)
      ),
    onSuccess: (updated) => {
      applyConversation(updated);
      setToAdd([]);
      setAddOpen(false);
    },
    onError: (err) => toast(errorMessage(err, 'Could not add members'), 'error'),
  });

  const remove = useMutation({
    mutationFn: (userId: string) => dmApi.removeParticipant(conversation.id, userId),
    onSuccess: (_, userId) => {
      queryClient.setQueryData<Conversation>(['conversation', conversation.id], (c) =>
        c ? { ...c, participants: c.participants.filter((p) => p.id !== userId) } : c
      );
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (err) => toast(errorMessage(err, 'Could not remove member'), 'error'),
  });

  const leave = useMutation({
    mutationFn: () => dmApi.removeParticipant(conversation.id, ownId),
    onSuccess: () => {
      onClose();
      queryClient.removeQueries({ queryKey: ['messages', conversation.id] });
      queryClient.removeQueries({ queryKey: ['conversation', conversation.id] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['unread-dms'] });
      navigate('/messages');
    },
    onError: (err) => toast(errorMessage(err, 'Could not leave group'), 'error'),
  });

  const nameChanged = name.trim().length > 0 && name.trim() !== (conversation.groupName ?? '');

  return (
    <>
      <Modal open={open} onClose={onClose} title="Group details" variant="sheet">
        {/* Photo + name */}
        <div className="flex items-center gap-4 px-4 py-4">
          <button
            onClick={() => avatarInputRef.current?.click()}
            aria-label="Change group photo"
            className="group relative shrink-0 rounded-full"
            disabled={setAvatar.isPending}
          >
            <ConversationAvatar conversation={conversation} ownId={ownId} size={64} />
            <span
              className="absolute -bottom-0.5 -right-0.5 rounded-full bg-neutral-100 p-1.5 ring-2 ring-white dark:bg-neutral-800 dark:ring-neutral-900"
              aria-hidden
            >
              {setAvatar.isPending ? <Spinner size={14} /> : <Camera size={14} />}
            </span>
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-hidden
            tabIndex={-1}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setAvatar.mutate(file);
              e.target.value = '';
            }}
          />
          <div className="flex min-w-0 flex-1 items-end gap-2">
            <Input
              label="Group name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="Name your group"
            />
            <Button
              size="sm"
              variant="secondary"
              className="mb-0.5 shrink-0"
              disabled={!nameChanged}
              loading={rename.isPending}
              onClick={() => rename.mutate()}
            >
              Save
            </Button>
          </div>
        </div>

        {/* Members */}
        <div className="border-t border-border-light px-4 py-3 dark:border-border-dark">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-sm font-bold">Members · {conversation.participants.length}</h3>
            <button
              onClick={() => setAddOpen((v) => !v)}
              aria-expanded={addOpen}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-primary hover:bg-neutral-50 dark:hover:bg-neutral-800"
            >
              <UserPlus size={16} />
              Add
            </button>
          </div>

          {addOpen && (
            <div className="mb-2 rounded-xl border border-border-light dark:border-border-dark">
              <UserMultiSelect
                selected={toAdd}
                onChange={setToAdd}
                excludeIds={conversation.participants.map((p) => p.id)}
                autoFocus
              />
              <div className="border-t border-border-light p-3 dark:border-border-dark">
                <Button
                  className="w-full"
                  size="sm"
                  disabled={toAdd.length === 0}
                  loading={add.isPending}
                  onClick={() => add.mutate()}
                >
                  Add to group
                </Button>
              </div>
            </div>
          )}

          <ul aria-label="Group members">
            {conversation.participants.map((participant) => {
              const isSelf = participant.id === ownId;
              return (
                <li key={participant.id} className="flex items-center gap-3 py-2">
                  <Link
                    to={`/${participant.username}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <Avatar src={participant.avatarUrl} alt={participant.username} size={40} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">
                        {participant.username}
                        {isSelf && (
                          <span className="ml-1.5 font-normal text-muted-light dark:text-muted-dark">
                            (you)
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-xs text-muted-light dark:text-muted-dark">
                        {participant.isOnline ? 'Active now' : participant.fullName}
                      </span>
                    </span>
                  </Link>
                  {!isSelf && (
                    <button
                      onClick={() => setRemoveTarget(participant)}
                      aria-label={`Remove ${participant.username} from group`}
                      className="shrink-0 rounded-full p-1.5 text-muted-light hover:bg-neutral-100 hover:text-red-500 dark:text-muted-dark dark:hover:bg-neutral-800"
                    >
                      <X size={16} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Leave */}
        <div className="border-t border-border-light p-4 dark:border-border-dark">
          <Button
            variant="danger"
            className="w-full"
            loading={leave.isPending}
            onClick={() => setLeaveOpen(true)}
          >
            Leave group
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => {
          if (removeTarget) remove.mutate(removeTarget.id);
        }}
        title={`Remove ${removeTarget?.username ?? 'member'}?`}
        body="They will no longer see this conversation."
        confirmLabel="Remove"
      />

      <ConfirmDialog
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        onConfirm={() => leave.mutate()}
        title="Leave group?"
        body="You won't get messages from this group unless someone adds you back."
        confirmLabel="Leave"
      />
    </>
  );
}
