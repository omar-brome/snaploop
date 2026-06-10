import { cn } from '../../utils/cn';

interface AvatarProps {
  src?: string | null;
  alt?: string;
  size?: number;
  // Gradient ring marks unseen stories; gray ring marks seen ones.
  ring?: 'none' | 'story' | 'seen';
  className?: string;
}

export function Avatar({ src, alt = '', size = 32, ring = 'none', className }: AvatarProps) {
  const img = src ? (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className="h-full w-full rounded-full object-cover"
      loading="lazy"
    />
  ) : (
    <span
      aria-label={alt}
      className="flex h-full w-full items-center justify-center rounded-full bg-neutral-200 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-300"
      style={{ fontSize: size * 0.42 }}
    >
      {(alt[0] ?? '?').toUpperCase()}
    </span>
  );

  if (ring === 'none') {
    return (
      <span className={cn('inline-block shrink-0 overflow-hidden rounded-full', className)} style={{ width: size, height: size }}>
        {img}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full p-[2px]',
        ring === 'story' ? 'bg-story-ring' : 'bg-neutral-300 dark:bg-neutral-600',
        className
      )}
      style={{ width: size + 8, height: size + 8 }}
    >
      <span className="rounded-full bg-white p-[2px] dark:bg-black" style={{ width: size + 4, height: size + 4 }}>
        <span className="block h-full w-full overflow-hidden rounded-full">{img}</span>
      </span>
    </span>
  );
}
