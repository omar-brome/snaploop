import Redis from 'ioredis';
import { env } from '../config/env';

// Main client for commands; separate clients for pub/sub since a subscribed
// connection cannot issue regular commands.
export const redis = new Redis(env.redisUrl, { maxRetriesPerRequest: 3 });
export const redisPub = new Redis(env.redisUrl, { maxRetriesPerRequest: 3 });
export const redisSub = new Redis(env.redisUrl, { maxRetriesPerRequest: 3 });

redis.on('error', (err) => console.error('[redis] error:', err.message));
