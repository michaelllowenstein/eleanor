import type { LogFields, Logger } from "./logger.js";

export interface Span {
  /** Milliseconds since the span started. */
  elapsed(): number;
  /** Logs `<name>.done` at info with durationMs. */
  end(fields?: LogFields): number;
  /** Logs `<name>.failed` at warn with durationMs and the error. */
  fail(error: unknown, fields?: LogFields): number;
}

/**
 * Times one operation. Logs `<name>.start` at debug, then exactly one of
 * `<name>.done` or `<name>.failed`. Calls after the first end/fail are ignored.
 */
export function startSpan(logger: Logger, name: string, fields: LogFields = {}): Span {
  const started = performance.now();
  let finished = false;
  logger.debug(`${name}.start`, fields);

  const elapsed = () => Math.round(performance.now() - started);

  return {
    elapsed,
    end(extra) {
      const durationMs = elapsed();
      if (!finished) {
        finished = true;
        logger.info(`${name}.done`, { ...fields, ...extra, durationMs });
      }
      return durationMs;
    },
    fail(error, extra) {
      const durationMs = elapsed();
      if (!finished) {
        finished = true;
        logger.warn(`${name}.failed`, { ...fields, ...extra, durationMs, error });
      }
      return durationMs;
    },
  };
}
