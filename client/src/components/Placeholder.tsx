import { Construction } from 'lucide-react';

// Temporary stand-in while a feature page is under construction.
export function Placeholder({ name }: { name: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <Construction size={40} className="text-muted-light dark:text-muted-dark" />
      <p className="text-sm text-muted-light dark:text-muted-dark">{name} is being built…</p>
    </div>
  );
}
