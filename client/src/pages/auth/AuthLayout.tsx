import { ReactNode } from 'react';
import { Link } from 'react-router-dom';

// Centered card used by all auth pages (Instagram-style boxed form).
export function AuthLayout({
  children,
  footer,
}: {
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-4 dark:bg-black">
      <div className="w-full max-w-sm border border-border-light bg-white px-8 py-10 dark:border-border-dark dark:bg-black sm:rounded-lg">
        <h1
          className="mb-8 text-center text-4xl font-bold"
          style={{ fontFamily: 'Georgia, serif' }}
        >
          Snaploop
        </h1>
        {children}
      </div>
      {footer && (
        <div className="mt-3 w-full max-w-sm border border-border-light bg-white px-8 py-5 text-center text-sm dark:border-border-dark dark:bg-black sm:rounded-lg">
          {footer}
        </div>
      )}
      <p className="mt-6 text-xs text-muted-light dark:text-muted-dark">
        Snaploop — a demo Instagram-style app
      </p>
    </div>
  );
}

export function AuthSwitchLink({ text, linkText, to }: { text: string; linkText: string; to: string }) {
  return (
    <span>
      {text}{' '}
      <Link to={to} className="font-semibold text-primary">
        {linkText}
      </Link>
    </span>
  );
}
