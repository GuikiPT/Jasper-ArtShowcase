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
export const IMAGE_FIELD_ID = 'art-showcase:image';
export const MAX_IMAGE_UPLOADS = 10;
export const ART_SHOWCASE_DETAIL_DOT = '<:ruledot:1487941593787797584>';
export const REVIEW_ACTION_CUSTOM_ID_PREFIX = 'art-showcase:review';
export const REVIEW_DENIAL_MODAL_CUSTOM_ID_PREFIX = 'art-showcase:deny-modal';
export const REVIEW_DENIAL_REASON_FIELD_ID = 'art-showcase:deny-reason';

export const ART_SHOWCASE_REVIEWER_ROLE_IDS: readonly string[] = ['1497927862425223198'];
export const ART_SHOWCASE_SUBMISSION_LOG_CHANNEL_ID = '1498421958738706483';
export const ART_SHOWCASE_SUBMISSIONS_CHANNEL_ID = '1498421906825547806';
