type LogDetails = Record<string, string | number | boolean | null | undefined>;

type LoggerLike = {
  debug: (...values: unknown[]) => void;
  error: (...values: unknown[]) => void;
  info: (...values: unknown[]) => void;
  warn: (...values: unknown[]) => void;
};

export function logArtShowcaseDebug(logger: LoggerLike, action: string, details?: LogDetails) {
  logger.debug(formatArtShowcaseLog(action, details));
}

export function logArtShowcaseInfo(logger: LoggerLike, action: string, details?: LogDetails) {
  logger.info(formatArtShowcaseLog(action, details));
}

export function logArtShowcaseWarn(logger: LoggerLike, action: string, details?: LogDetails) {
  logger.warn(formatArtShowcaseLog(action, details));
}

export function logArtShowcaseError(logger: LoggerLike, action: string, error: unknown, details?: LogDetails) {
  logger.error(formatArtShowcaseLog(action, details), error);
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function formatArtShowcaseLog(action: string, details: LogDetails = {}) {
  const suffix = Object.entries(details)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(' ');

  return suffix ? `[ArtShowcase] ${action} ${suffix}` : `[ArtShowcase] ${action}`;
}
