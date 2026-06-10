// Cursor-based pagination helpers. A cursor encodes (createdAt, id) of the
// last item so the next page can resume with a stable sort even as new rows
// are inserted.

export interface CursorPayload {
  createdAt: string; // ISO timestamp
  id: string;
}

export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString(
    'base64url'
  );
}

export function decodeCursor(cursor: string | undefined | null): CursorPayload | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof parsed.createdAt === 'string' && typeof parsed.id === 'string') {
      return parsed as CursorPayload;
    }
    return null;
  } catch {
    return null;
  }
}

// Prisma "where" fragment for keyset pagination on (createdAt DESC, id DESC).
export function cursorWhere(cursor: CursorPayload | null) {
  if (!cursor) return {};
  const createdAt = new Date(cursor.createdAt);
  return {
    OR: [
      { createdAt: { lt: createdAt } },
      { createdAt, id: { lt: cursor.id } },
    ],
  };
}

// Build the standard paginated meta from one-extra-row fetching: query
// (limit + 1) rows, pass them here, get back the trimmed page + meta.
export function paginate<T extends { id: string; createdAt: Date }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    items: page,
    meta: {
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
      hasMore,
    },
  };
}
