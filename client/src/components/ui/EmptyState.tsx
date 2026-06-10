import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, body, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full border-2 border-current text-neutral-800 dark:text-neutral-200">
        <Icon size={36} strokeWidth={1.5} />
      </div>
      <h3 className="text-xl font-bold">{title}</h3>
      {body && <p className="mt-1 max-w-xs text-sm text-muted-light dark:text-muted-dark">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
