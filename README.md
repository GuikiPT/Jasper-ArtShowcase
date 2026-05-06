# Jasper Art Showcase

Discord bot for handling Art Showcase submissions and staff review flows with Sapphire.

## Setup

```sh
pnpm install
```

Create `src/.env` with the bot token and any optional overrides used by this project.

## Art Showcase Configuration

These environment variables are supported:

- `ART_SHOWCASE_BLACKLIST_ROLE_IDS`: comma-separated role IDs that cannot submit to Art Showcase. Defaults to the Art Blacklist role.
- `ART_SHOWCASE_SUBMIT_WHITELIST_ROLE_IDS`: comma-separated role IDs allowed to submit to Art Showcase. Defaults to Level 10 and above, excluding Level 5.
- `ART_SHOWCASE_REVIEWER_ROLE_IDS`: comma-separated reviewer role IDs.
- `ART_SHOWCASE_REVIEW_PING_ROLE_IDS`: comma-separated role IDs to ping on new submissions. Defaults to the Art Reviewer role.
- `ART_SHOWCASE_AUTOMOD_LOG_CHANNEL_ID`: channel for blocked submission logs.
- `ART_SHOWCASE_SUBMISSION_LOG_CHANNEL_ID`: private staff review channel.
- `ART_SHOWCASE_SUBMISSIONS_CHANNEL_ID`: public showcase channel.
- `ART_SHOWCASE_SUBMISSION_COOLDOWN_MINUTES`: submission cooldown in minutes.
- `SIGHTENGINE_API_USER`: Sightengine API user for AI checks.
- `SIGHTENGINE_API_SECRET`: Sightengine API secret for AI checks.
- `DEBUG_LOG_WEBHOOK_URL`: optional Discord webhook for log forwarding.
- `DEBUG_LOG_FLUSH_INTERVAL_MS`: optional webhook logger flush interval.
- `OWNERS`: comma-separated owner user IDs.

Current defaults remain in code for the Art Showcase IDs, but environment values take precedence.

## Development

```sh
pnpm run watch:start
```

For webhook logger testing:

```sh
pnpm run watch:debug
```

## Build

```sh
pnpm run build
pnpm run start
```
