import { env } from './config/env';
import { createApp } from './app';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { startJobs } from './jobs/runner';
import { runSeed } from './seed';

async function main() {
  if (env.SEED_ON_START === 'true') await runSeed(prisma).catch((err) => logger.error({ err }, 'Seed failed'));
}
void main();

const server = createApp().listen(env.PORT, () => logger.info(`Lensio API listening on :${env.PORT}`));
if (process.env.RUN_JOBS !== 'false') startJobs();

const shutdown = async (sig: string) => {
  logger.info(`${sig} received, shutting down`);
  server.close(async () => { await prisma.$disconnect(); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
