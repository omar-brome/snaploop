import http from 'http';
import app from './app';
import { env } from './config/env';
import { initSocket } from './sockets/index';
import { startJobs } from './jobs/storyCleanup';
import { prisma } from './lib/prisma';
import { redis, redisPub, redisSub } from './lib/redis';

const server = http.createServer(app);
initSocket(server);
startJobs();

server.listen(env.port, () => {
  console.log(`Snaploop API listening on http://localhost:${env.port}`);
});

async function shutdown(signal: string) {
  console.log(`\n${signal} received, shutting down...`);
  server.close();
  await prisma.$disconnect();
  redis.disconnect();
  redisPub.disconnect();
  redisSub.disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
