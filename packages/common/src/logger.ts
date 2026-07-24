type Level = 'info' | 'warn' | 'error' | 'debug';

/** Minimal structured logger so every service prints in the same shape. */
export function createLogger(service: string) {
  const write = (level: Level, message: string, meta?: unknown) => {
    const line = {
      ts: new Date().toISOString(),
      level,
      service,
      message,
      ...(meta ? { meta } : {}),
    };
    const target = level === 'error' ? console.error : console.log;
    target(JSON.stringify(line));
  };

  return {
    info: (message: string, meta?: unknown) => write('info', message, meta),
    warn: (message: string, meta?: unknown) => write('warn', message, meta),
    error: (message: string, meta?: unknown) => write('error', message, meta),
    debug: (message: string, meta?: unknown) => {
      if (process.env.NODE_ENV !== 'production') write('debug', message, meta);
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
