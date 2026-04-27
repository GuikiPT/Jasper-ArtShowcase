const LOG_METHODS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
const REDACTED = '[REDACTED]';
const MAX_WEBHOOK_CHARS = 1_900;
const DEFAULT_FLUSH_INTERVAL_MS = 3_000;
const ANSI_ESCAPE_PATTERN = /\u001B\[[0-9;]*m/g;

type LogMethod = (typeof LOG_METHODS)[number];

type LoggerLike = {
  [key in LogMethod]?: (...values: unknown[]) => void;
};

type QueuedLog = {
  level: Uppercase<LogMethod>;
  method: LogMethod;
  message: string;
  createdAt: number;
};

type WebhookLoggerOptions = {
  flushIntervalMs?: number;
  identityProvider?: () => { avatarUrl?: string; username?: string };
  mentionLevels?: readonly LogMethod[];
  ownerIds?: readonly string[];
};

export function installWebhookLogger(logger: LoggerLike, webhookUrl: string, options: WebhookLoggerOptions = {}) {
  if (!webhookUrl) return;

  const queue: QueuedLog[] = [];
  let flushing = false;
  let flushTimer: NodeJS.Timeout | null = null;
  const secrets = collectSecrets();
  const flushIntervalMs = resolveFlushInterval(options.flushIntervalMs);
  const mentionLevels = new Set<LogMethod>(options.mentionLevels ?? ['error', 'fatal']);
  const ownerIds = [...(options.ownerIds ?? [])];

  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flushQueue();
    }, flushIntervalMs);
  };

  const flushQueue = async () => {
    if (flushing || queue.length === 0) return;
    flushing = true;

    try {
      while (queue.length > 0) {
        const payload = buildPayload(queue, {
          identity: options.identityProvider?.(),
          ownerIds,
          mentionLevels
        });
        await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify(payload)
        }).catch(() => null);
      }
    } finally {
      flushing = false;
    }
  };

  for (const method of LOG_METHODS) {
    const original = logger[method]?.bind(logger);
    if (!original) continue;

    logger[method] = (...values: unknown[]) => {
      original(...values);

      queue.push({
        level: method.toUpperCase() as Uppercase<LogMethod>,
        method,
        message: redactSecrets(stripAnsiCodes(formatValues(values)), secrets),
        createdAt: Date.now()
      });

      scheduleFlush();
    };
  }
}

function resolveFlushInterval(value: number | undefined) {
  if (!value || Number.isNaN(value)) return DEFAULT_FLUSH_INTERVAL_MS;
  return Math.max(500, value);
}

function buildPayload(
  queue: QueuedLog[],
  options: {
    identity?: { avatarUrl?: string; username?: string };
    mentionLevels: Set<LogMethod>;
    ownerIds: string[];
  }
) {
  const lines: string[] = [];
  let currentLength = 0;
  let shouldMentionOwners = false;

  while (queue.length > 0) {
    const entry = queue[0];
    const line = `[${entry.level}] ${new Date(entry.createdAt).toISOString()} ${entry.message}`;
    const nextLength = currentLength + line.length + (lines.length > 0 ? 1 : 0);

    if (lines.length > 0 && nextLength > MAX_WEBHOOK_CHARS) break;

    queue.shift();
    lines.push(line);
    shouldMentionOwners ||= options.mentionLevels.has(entry.method);
    currentLength = nextLength;
  }

  const mentionPrefix = shouldMentionOwners && options.ownerIds.length > 0
    ? `${options.ownerIds.map((ownerId) => `<@${ownerId}>`).join(' ')}\n`
    : '';
  const content = `${mentionPrefix}\`\`\`txt\n${lines.join('\n').slice(0, MAX_WEBHOOK_CHARS)}\n\`\`\``;

  return {
    content,
    allowed_mentions: shouldMentionOwners && options.ownerIds.length > 0
      ? { parse: [], users: options.ownerIds }
      : { parse: [] },
    avatar_url: options.identity?.avatarUrl,
    username: options.identity?.username
  };
}

function formatValues(values: unknown[]) {
  return values.map((value) => formatValue(value)).join(' ');
}

function formatValue(value: unknown): string {
  if (value instanceof Error) {
    return value.stack || `${value.name}: ${value.message}`;
  }

  if (typeof value === 'string') return value;

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function collectSecrets() {
  return Object.entries(process.env)
    .filter(([key, value]) => Boolean(value) && /(token|secret|key|password|webhook|api)/i.test(key))
    .map(([, value]) => value as string)
    .filter((value, index, list) => value.length >= 6 && list.indexOf(value) === index)
    .sort((left, right) => right.length - left.length);
}

function redactSecrets(input: string, secrets: string[]) {
  let redacted = input;

  for (const secret of secrets) {
    redacted = redacted.split(secret).join(REDACTED);
  }

  return redacted;
}

function stripAnsiCodes(input: string) {
  return input.replace(ANSI_ESCAPE_PATTERN, '');
}
