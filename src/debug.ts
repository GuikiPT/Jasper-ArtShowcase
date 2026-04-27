import './lib/setup';

import { envParseArray } from '@skyra/env-utilities';
import { createBotClient, startBot } from './lib/client';
import { installWebhookLogger } from './lib/webhook-logger';

const client = createBotClient();
const debugWebhookUrl = process.env.DEBUG_LOG_WEBHOOK_URL;
const debugFlushIntervalMs = Number(process.env.DEBUG_LOG_FLUSH_INTERVAL_MS || 3_000);
const ownerIds = envParseArray('OWNERS');

if (debugWebhookUrl) {
  installWebhookLogger(client.logger, debugWebhookUrl, {
    flushIntervalMs: debugFlushIntervalMs,
    ownerIds,
    mentionLevels: ['error', 'fatal'],
    identityProvider: () => ({
      avatarUrl: client.user?.displayAvatarURL({ extension: 'png' }),
      username: client.user ? `${client.user.username} Debug Logger` : 'Debug Logger'
    })
  });
  client.logger.info(`Discord webhook log forwarding enabled (flush=${Number.isNaN(debugFlushIntervalMs) ? 3_000 : debugFlushIntervalMs}ms)`);
} else {
  client.logger.warn('DEBUG_LOG_WEBHOOK_URL is not set; webhook log forwarding disabled');
}

void startBot(client);
