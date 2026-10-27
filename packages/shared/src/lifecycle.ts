import type { Logger } from './logger';

/**
 * Runs a polling loop until a shutdown signal arrives. The current iteration is
 * always allowed to finish so that leases are released or committed cleanly.
 */
export interface LoopOptions {
  name: string;
  intervalMs: number;
  logger: Logger;
  /** Returns the number of items processed; a non-zero result re-runs immediately. */
  tick: () => Promise<number>;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}

export async function runLoop(opts: LoopOptions, signal: AbortSignal): Promise<void> {
  let consecutiveErrors = 0;
  while (!signal.aborted) {
    try {
      const n = await opts.tick();
      consecutiveErrors = 0;
      if (n === 0) await sleep(opts.intervalMs, signal);
    } catch (err) {
      consecutiveErrors += 1;
      opts.logger.error({ err, loop: opts.name, consecutiveErrors }, 'loop iteration failed');
      await sleep(Math.min(30_000, opts.intervalMs * 2 ** Math.min(consecutiveErrors, 6)), signal);
    }
  }
}

export function onShutdown(logger: Logger, handlers: Array<() => Promise<void>>): AbortSignal {
  const controller = new AbortController();
  let shuttingDown = false;
  const shutdown = async (sig: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ sig }, 'shutdown requested');
    controller.abort();
    for (const h of handlers) {
      try {
        await h();
      } catch (err) {
        logger.error({ err }, 'shutdown handler failed');
      }
    }
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  return controller.signal;
}
