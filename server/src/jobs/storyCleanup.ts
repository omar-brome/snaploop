import { prisma } from '../lib/prisma';
import * as storage from '../services/storage.service';

// Expired stories are filtered out of every query by expiresAt, but this job
// physically removes them. Stories saved to a highlight are kept (the
// highlight still needs the media) — only unreferenced expired stories go.
export async function cleanupExpiredStories() {
  const expired = await prisma.story.findMany({
    where: { expiresAt: { lt: new Date() }, highlightStories: { none: {} } },
    select: { id: true, mediaUrl: true },
  });
  if (expired.length === 0) return 0;

  await prisma.story.deleteMany({ where: { id: { in: expired.map((s) => s.id) } } });
  await Promise.all(expired.map((s) => storage.deleteByUrl(s.mediaUrl)));
  console.log(`[jobs] cleaned up ${expired.length} expired stories`);
  return expired.length;
}

export function startJobs() {
  // Hourly sweep; also run shortly after boot.
  setTimeout(() => cleanupExpiredStories().catch(console.error), 10_000);
  setInterval(() => cleanupExpiredStories().catch(console.error), 60 * 60 * 1000);
}
