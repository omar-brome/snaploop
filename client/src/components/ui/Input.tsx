import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../utils/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, className, id, ...rest },
  ref
) {
  const inputId = id ?? rest.name;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-1 block text-xs font-medium text-muted-light dark:text-muted-dark">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          'w-full rounded-md border border-border-light bg-neutral-50 px-3 py-2 text-sm outline-none',
          'placeholder:text-neutral-400 focus:border-neutral-400',
          'dark:border-border-dark dark:bg-neutral-900 dark:focus:border-neutral-500',
          error && 'border-red-500 dark:border-red-500',
          className
        )}
        aria-invalid={!!error}
        {...rest}
      />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, className, id, ...rest },
  ref
) {
  const inputId = id ?? rest.name;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-1 block text-xs font-medium text-muted-light dark:text-muted-dark">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={inputId}
        className={cn(
          'w-full resize-none rounded-md border border-border-light bg-neutral-50 px-3 py-2 text-sm outline-none',
          'placeholder:text-neutral-400 focus:border-neutral-400',
          'dark:border-border-dark dark:bg-neutral-900 dark:focus:border-neutral-500',
          error && 'border-red-500 dark:border-red-500',
          className
        )}
        aria-invalid={!!error}
        {...rest}
      />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
});
