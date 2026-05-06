function envString(name: string, fallback = '') {
  return process.env[name]?.trim() || fallback;
}

function envStringArray(name: string, fallback: readonly string[]) {
  const value = process.env[name]?.trim();
  if (!value) return [...fallback];

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function envNonNegativeInteger(name: string, fallback: number) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;

  return Math.max(0, Math.floor(value));
}

export const THEME_OPTIONS = [
  {
    label: 'Bot Inspired',
    value: 'bot-inspired',
    description: 'Artwork inspired by our server bots.'
  },
  {
    label: 'Server Inspired',
    value: 'server-inspired',
    description: 'Artwork inspired by the server community.'
  },
  {
    label: 'NTTS Inspired',
    value: 'ntts-inspired',
    description: 'Artwork inspired by NTTS themes or references.'
  }
] as const;

export const SUBMIT_MODAL_ID = 'art-showcase:submit';
export const THEME_FIELD_ID = 'art-showcase:theme';
export const DESCRIPTION_FIELD_ID = 'art-showcase:description';
export const DESCRIPTION_MAX_LENGTH = 512;
export const ART_SHOWCASE_SUBMISSION_COOLDOWN_MINUTES = envNonNegativeInteger('ART_SHOWCASE_SUBMISSION_COOLDOWN_MINUTES', 1);
export const IMAGE_FIELD_ID = 'art-showcase:image';
export const MAX_IMAGE_UPLOADS = 10;
export const ART_SHOWCASE_DETAIL_DOT = '<:test_jasper_dot:1486080288755945614>';
export const REVIEW_ACTION_CUSTOM_ID_PREFIX = 'art-showcase:review';
export const REVIEW_DENIAL_MODAL_CUSTOM_ID_PREFIX = 'art-showcase:deny-modal';
export const REVIEW_DENIAL_REASON_FIELD_ID = 'art-showcase:deny-reason';

export const ART_SHOWCASE_REVIEWER_ROLE_IDS: readonly string[] = envStringArray('ART_SHOWCASE_REVIEWER_ROLE_IDS', [
  '1221608852676677732', // Server Manager
  '832813071285616680', // Administrator
  '1312570653026811924', // Developer
  '853315383213948938' // Staff
]);
export const ART_SHOWCASE_REVIEW_PING_ROLE_IDS: readonly string[] = envStringArray('ART_SHOWCASE_REVIEW_PING_ROLE_IDS', [
  '1501599928718327861' // Art Reviewer
]);
export const ART_SHOWCASE_AUTOMOD_LOG_CHANNEL_ID = envString('ART_SHOWCASE_AUTOMOD_LOG_CHANNEL_ID', '1500978139780747334');
export const ART_SHOWCASE_SUBMISSION_LOG_CHANNEL_ID = envString('ART_SHOWCASE_SUBMISSION_LOG_CHANNEL_ID', '1498421958738706483');
export const ART_SHOWCASE_SUBMISSIONS_CHANNEL_ID = envString('ART_SHOWCASE_SUBMISSIONS_CHANNEL_ID', '1498421906825547806');
