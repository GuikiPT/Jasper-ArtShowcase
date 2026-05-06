// Unless explicitly defined, set NODE_ENV as development:
process.env.NODE_ENV ??= 'development';

import { ApplicationCommandRegistries, RegisterBehavior } from '@sapphire/framework';
import '@kaname-png/plugin-subcommands-advanced/register';
import '@kbotdev/plugin-modules/register';
import '@sapphire/plugin-api/register';
import '@sapphire/plugin-editable-commands/register';
import '@sapphire/plugin-logger/register';
import { setup, type ArrayString } from '@skyra/env-utilities';
import * as colorette from 'colorette';
import { join } from 'path';
import { inspect } from 'util';
import { srcDir } from './constants';

// Set default behavior to bulk overwrite
ApplicationCommandRegistries.setDefaultBehaviorWhenNotIdentical(RegisterBehavior.Overwrite);

// Read env var
setup({ path: join(srcDir, '.env') });

// Set default inspection depth
inspect.defaultOptions.depth = 1;

// Enable colorette
colorette.createColors({ useColor: true });

declare module '@skyra/env-utilities' {
	interface Env {
		ART_SHOWCASE_AUTOMOD_LOG_CHANNEL_ID: string | undefined;
		ART_SHOWCASE_BLACKLIST_ROLE_IDS: ArrayString | undefined;
		ART_SHOWCASE_MINIMUM_SUBMIT_ROLE_ID: string | undefined;
		ART_SHOWCASE_REVIEW_PING_ROLE_IDS: ArrayString | undefined;
		ART_SHOWCASE_REVIEWER_ROLE_IDS: ArrayString | undefined;
		ART_SHOWCASE_SUBMIT_WHITELIST_ROLE_IDS: ArrayString | undefined;
		ART_SHOWCASE_SUBMISSION_COOLDOWN_MINUTES: string | undefined;
		ART_SHOWCASE_SUBMISSION_LOG_CHANNEL_ID: string | undefined;
		ART_SHOWCASE_SUBMISSIONS_CHANNEL_ID: string | undefined;
		DEBUG_LOG_FLUSH_INTERVAL_MS: string | undefined;
		DEBUG_LOG_WEBHOOK_URL: string | undefined;
		OWNERS: ArrayString;
		SIGHTENGINE_API_SECRET: string;
		SIGHTENGINE_API_USER: string;
	}
}
