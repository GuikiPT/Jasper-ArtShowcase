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
export const ART_SHOWCASE_MINIMUM_SUBMIT_LEVEL_LABEL = 'Level 10';

export const ART_SHOWCASE_BLACKLIST_ROLE_IDS: readonly string[] = envStringArray('ART_SHOWCASE_BLACKLIST_ROLE_IDS', [
  '1191884366549352458' // Art Blacklist
]);
export const ART_SHOWCASE_SUBMIT_WHITELIST_ROLE_IDS: readonly string[] = envStringArray('ART_SHOWCASE_SUBMIT_WHITELIST_ROLE_IDS', [
  '948566896029106186', // Level 10
  '948566951913992302', // Level 25
  '948567001843007499', // Level 50
  '990362232862965800', // Level 75
  '948570932434333706', // Level 100
  '948567048705937470', // Level 125
  '1141526909004558378', // Level 150
  '1141527275389603910', // Please Touch Grass
  '1500991488434114560' // Testing Role from Fore 
  //TODO: ^^ Remove this once we production
]);
export const ART_SHOWCASE_REVIEWER_ROLE_IDS: readonly string[] = envStringArray('ART_SHOWCASE_REVIEWER_ROLE_IDS', [
  '1221608852676677732', // Server Manager
  '832813071285616680', // Administrator
  '1312570653026811924', // Developer
  '853315383213948938' // Staff
]);
export const ART_SHOWCASE_REVIEW_PING_ROLE_IDS: readonly string[] = envStringArray('ART_SHOWCASE_REVIEW_PING_ROLE_IDS', [
  '1501599928718327861' // Art Reviewer
]);
export const ART_SHOWCASE_AUTOMOD_LOG_CHANNEL_ID = envString('ART_SHOWCASE_AUTOMOD_LOG_CHANNEL_ID', '1501618764603592714');
export const ART_SHOWCASE_SUBMISSION_LOG_CHANNEL_ID = envString('ART_SHOWCASE_SUBMISSION_LOG_CHANNEL_ID', '1501605159703154688');
export const ART_SHOWCASE_SUBMISSIONS_CHANNEL_ID = envString('ART_SHOWCASE_SUBMISSIONS_CHANNEL_ID', '1501604333777846404');
