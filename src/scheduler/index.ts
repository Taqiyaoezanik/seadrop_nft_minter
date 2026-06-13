import { getPendingScheduledMints, updateScheduledMintStatus } from '../db/scheduledMints';
import { addMintJob } from '../queue/mintQueue';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

let schedulerInterval: NodeJS.Timeout | null = null;

/**
 * Check for scheduled mints that are due and execute them
 */
async function checkAndExecuteScheduledMints(): Promise<void> {
  try {
    const pendingMints = getPendingScheduledMints();

    if (pendingMints.length === 0) {
      return;
    }

    logger.info(`[SCHEDULER] Found ${pendingMints.length} scheduled mint(s) ready to execute`);

    for (const scheduled of pendingMints) {
      try {
        const jobId = uuidv4();

        logger.info(
          `[SCHEDULER] Executing scheduled mint ${scheduled.id} for user ${scheduled.telegram_id}`
        );

        // Queue the mint job
        await addMintJob(
          {
            telegramId: scheduled.telegram_id,
            url: scheduled.url,
            jobId,
            walletRange:
              scheduled.wallet_from && scheduled.wallet_to
                ? { from: scheduled.wallet_from, to: scheduled.wallet_to }
                : undefined,
          },
          jobId
        );

        // Update status to EXECUTED
        updateScheduledMintStatus(scheduled.id, 'EXECUTED', {
          job_id: jobId,
          executed_at: new Date().toISOString(),
        });

        logger.info(`[SCHEDULER] Successfully queued scheduled mint ${scheduled.id} as job ${jobId}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`[SCHEDULER] Failed to execute scheduled mint ${scheduled.id}: ${errorMessage}`);

        updateScheduledMintStatus(scheduled.id, 'FAILED', {
          error_message: errorMessage,
          executed_at: new Date().toISOString(),
        });
      }
    }
  } catch (error) {
    logger.error(`[SCHEDULER] Error checking scheduled mints: ${error instanceof Error ? error.message : 'unknown'}`);
  }
}

/**
 * Start the scheduler that checks every 30 seconds
 */
export function startScheduler(): void {
  if (schedulerInterval) {
    logger.warn('[SCHEDULER] Scheduler already running');
    return;
  }

  logger.info('[SCHEDULER] Starting scheduled mint checker');

  // Check immediately on start
  checkAndExecuteScheduledMints();

  // Then check every 30 seconds
  schedulerInterval = setInterval(() => {
    checkAndExecuteScheduledMints();
  }, 30000);
}

/**
 * Stop the scheduler
 */
export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info('[SCHEDULER] Scheduler stopped');
  }
}
