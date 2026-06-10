import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UserSearchResult } from '../../types';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { toast } from '../../stores/uiStore';
import { dmApi } from './api';
import { UserMultiSelect } from './UserMultiSelect';

// New-conversation modal: pick one user for a 1:1 (server reuses an existing
// thread) or several + a name for a group.
export function NewMessageModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [selected, setSelected] = useState<UserSearchResult[]>([]);
  const [groupName, setGroupName] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const close = () => {
    setSelected([]);
    setGroupName('');
    onClose();
  };

  const create = useMutation({
    mutationFn: () =>
      dmApi.createConversation(
        selected.length > 1
          ? {
              participantIds: selected.map((u) => u.id),
              isGroup: true,
              groupName: groupName.trim(),
            }
          : { participantIds: selected.map((u) => u.id) }
      ),
    onSuccess: (conversation) => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      close();
      navigate(`/messages/${conversation.id}`);
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Could not start chat', 'error'),
  });

  const isGroup = selected.length > 1;
  const canSubmit = selected.length === 1 || (isGroup && groupName.trim().length > 0);

  return (
    <Modal open={open} onClose={close} title="New message" className="max-w-lg">
      <UserMultiSelect selected={selected} onChange={setSelected} autoFocus />

      {isGroup && (
        <div className="border-t border-border-light px-4 py-3 dark:border-border-dark">
          <Input
            label="Group name"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Name your group"
            maxLength={60}
          />
        </div>
      )}

      <div className="border-t border-border-light p-4 dark:border-border-dark">
        <Button
          className="w-full"
          disabled={!canSubmit}
          loading={create.isPending}
          onClick={() => create.mutate()}
        >
          Chat
        </Button>
      </div>
    </Modal>
  );
}
