// Extract #hashtags and @mentions from captions/comments.

const HASHTAG_RE = /#([\p{L}\p{N}_]{1,100})/gu;
const MENTION_RE = /@([a-zA-Z0-9._]{1,30})/g;

export function extractHashtags(text: string | null | undefined): string[] {
  if (!text) return [];
  const tags = new Set<string>();
  for (const match of text.matchAll(HASHTAG_RE)) {
    tags.add(match[1].toLowerCase());
  }
  return [...tags];
}

export function extractMentions(text: string | null | undefined): string[] {
  if (!text) return [];
  const names = new Set<string>();
  for (const match of text.matchAll(MENTION_RE)) {
    names.add(match[1].toLowerCase());
  }
  return [...names];
}
