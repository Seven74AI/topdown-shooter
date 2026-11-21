import { pino, type Logger } from "pino";

/**
 * The root logger: pino JSON lines on stdout (architecture › Logging). `index.ts` sets the level
 * from `LOG_LEVEL` before the server listens; tests set it to "silent" unless asked otherwise.
 */
export const log: Logger = pino({ level: "info" });

/** A child logger that puts `roomId` on every line. */
export function roomLog(roomId: string): Logger {
  return log.child({ roomId });
}
