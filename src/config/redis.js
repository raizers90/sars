const { createClient } = require('redis');
const logger = require('../utils/logger');

let redisClient = null;

const connectRedis = async () => {
  redisClient = createClient({
    socket: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
    },
    password: process.env.REDIS_PASSWORD || undefined,
    database: parseInt(process.env.REDIS_DB) || 0,
  });

  redisClient.on('error', (err) => logger.error('Redis error:', err));
  redisClient.on('connect', () => logger.info('Redis connected'));
  redisClient.on('reconnecting', () => logger.warn('Redis reconnecting...'));

  await redisClient.connect();
  return redisClient;
};

const getRedis = () => {
  if (!redisClient) throw new Error('Redis not initialized');
  return redisClient;
};

// Helper wrappers
const redisSet = async (key, value, ttlSeconds = null) => {
  const client = getRedis();
  const serialized = JSON.stringify(value);
  if (ttlSeconds) {
    await client.setEx(key, ttlSeconds, serialized);
  } else {
    await client.set(key, serialized);
  }
};

const redisGet = async (key) => {
  const client = getRedis();
  const val = await client.get(key);
  return val ? JSON.parse(val) : null;
};

const redisDel = async (key) => {
  const client = getRedis();
  await client.del(key);
};

const redisPush = async (key, value, maxLen = 1000) => {
  const client = getRedis();
  await client.lPush(key, JSON.stringify(value));
  await client.lTrim(key, 0, maxLen - 1);
};

const redisLRange = async (key, start = 0, stop = -1) => {
  const client = getRedis();
  const items = await client.lRange(key, start, stop);
  return items.map((i) => JSON.parse(i));
};

const redisPublish = async (channel, message) => {
  const client = getRedis();
  await client.publish(channel, JSON.stringify(message));
};

module.exports = {
  connectRedis,
  getRedis,
  redisSet,
  redisGet,
  redisDel,
  redisPush,
  redisLRange,
  redisPublish,
};
