import { Link } from 'react-router-dom';
import { Fragment } from 'react';

// Renders caption/comment text with clickable #hashtags and @mentions.
const TOKEN_RE = /([#@][\p{L}\p{N}._]+)/gu;

export function RichText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(TOKEN_RE);
  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part.startsWith('#') && part.length > 1) {
          return (
            <Link
              key={i}
              to={`/explore/tags/${encodeURIComponent(part.slice(1).toLowerCase())}`}
              className="text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </Link>
          );
        }
        if (part.startsWith('@') && part.length > 1) {
          return (
            <Link
              key={i}
              to={`/${encodeURIComponent(part.slice(1).toLowerCase().replace(/\.$/, ''))}`}
              className="text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </Link>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </span>
  );
}
