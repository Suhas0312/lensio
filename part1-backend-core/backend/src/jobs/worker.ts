import '../config/env';
import { startJobs } from './runner';
import { logger } from '../lib/logger';
startJobs();
logger.info('Lensio job worker started');
