import { PrismaClient } from '@prisma/client';
import { runSeed } from '../src/seed';

const prisma = new PrismaClient();
runSeed(prisma).finally(() => prisma.$disconnect());
