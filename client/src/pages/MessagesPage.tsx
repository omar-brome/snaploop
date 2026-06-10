import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Send } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { ConversationList } from '../features/dm/ConversationList';
import { MessageThread } from '../features/dm/MessageThread';
import { NewMessageModal } from '../features/dm/NewMessageModal';
import { useDmRealtime } from '../features/dm/realtime';
import { cn } from '../utils/cn';

// /messages and /messages/:conversationId — responsive master/detail.
// Mobile shows either the inbox or the open thread; md+ shows both panes.
// Height accounts for the mobile top bar (h-14) + bottom nav padding (pb-14).
export default function MessagesPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const [composeOpen, setComposeOpen] = useState(false);

  // Global DM socket listeners, mounted once for both panes.
  useDmRealtime(conversationId);

  return (
    <div className="flex h-[calc(100dvh-7rem)] md:h-dvh">
      <section
        aria-label="Conversations"
        className={cn(
          'h-full w-full flex-col md:flex md:w-[380px] md:shrink-0 md:border-r md:border-border-light md:dark:border-border-dark',
          conversationId ? 'hidden' : 'flex'
        )}
      >
        <ConversationList activeId={conversationId} onCompose={() => setComposeOpen(true)} />
      </section>

      <section
        aria-label="Conversation"
        className={cn('h-full min-w-0 flex-1 flex-col md:flex', conversationId ? 'flex' : 'hidden')}
      >
        {conversationId ? (
          // Keyed so thread-local state (reply draft, dialogs) resets per thread.
          <MessageThread key={conversationId} conversationId={conversationId} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={Send}
              title="Your messages"
              body="Send photos and messages to a friend or group."
              action={<Button onClick={() => setComposeOpen(true)}>Send message</Button>}
            />
          </div>
        )}
      </section>

      <NewMessageModal open={composeOpen} onClose={() => setComposeOpen(false)} />
    </div>
  );
}
