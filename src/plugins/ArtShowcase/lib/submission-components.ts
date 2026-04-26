import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageActionRowComponentBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder
} from 'discord.js';
import {
  REVIEW_ACTION_CUSTOM_ID_PREFIX,
  REVIEW_DENIAL_MODAL_CUSTOM_ID_PREFIX,
  THEME_OPTIONS
} from '../constants';

const ART_SHOWCASE_PENDING_COLOR = 0xf1c40f;
const ART_SHOWCASE_APPROVED_COLOR = 0x2ecc71;
const ART_SHOWCASE_DENIED_COLOR = 0xe74c3c;

export interface SubmissionImage {
  name: string;
  url: string;
}

export interface SubmissionDisplayData {
  artistId: string;
  artistName: string;
  artistAvatarUrl: string | null;
  themeValue: string;
  images: SubmissionImage[];
  submittedAtTimestamp?: number;
}

interface ReviewStatusPending {
  state: 'pending';
}

interface ReviewStatusResolved {
  state: 'approved' | 'denied';
  reviewerId: string;
  reviewerName: string;
  reviewedAtTimestamp: number;
  denialReason?: string;
}

export type ReviewStatus = ReviewStatusPending | ReviewStatusResolved;

export function resolveThemeOption(themeValue: string) {
  return THEME_OPTIONS.find((theme) => theme.value === themeValue) ?? null;
}

export interface ReviewActionMetadata {
  action: 'approve' | 'deny';
  artistId: string;
  themeValue: string;
}

export function createReviewActionCustomId(action: 'approve' | 'deny', artistId: string, themeValue: string) {
  return `${REVIEW_ACTION_CUSTOM_ID_PREFIX}:${action}:${artistId}:${themeValue}`;
}

export function createReviewDenialModalCustomId(artistId: string, themeValue: string) {
  return `${REVIEW_DENIAL_MODAL_CUSTOM_ID_PREFIX}:${artistId}:${themeValue}`;
}

export function parseReviewActionCustomId(customId: string): ReviewActionMetadata | null {
  const [prefix, scope, action, artistId, ...themeParts] = customId.split(':');

  if (`${prefix}:${scope}` !== REVIEW_ACTION_CUSTOM_ID_PREFIX) return null;
  if (action !== 'approve' && action !== 'deny') return null;

  const themeValue = themeParts.join(':');
  if (!artistId || !themeValue) return null;

  return { action, artistId, themeValue };
}

export function extractReviewActionMetadataFromMessageComponents(components: readonly unknown[]): ReviewActionMetadata | null {
  let reviewAction: ReviewActionMetadata | null = null;

  const visit = (component: unknown) => {
    if (!component || typeof component !== 'object' || reviewAction) return;

    const candidate = component as {
      components?: unknown[];
      custom_id?: string;
      customId?: string;
    };

    const customId = candidate.custom_id ?? candidate.customId;
    if (typeof customId === 'string') {
      const parsed = parseReviewActionCustomId(customId);
      if (parsed) {
        reviewAction = parsed;
        return;
      }
    }

    if (Array.isArray(candidate.components)) {
      for (const child of candidate.components) visit(child);
    }
  };

  for (const component of components) visit(component);

  return reviewAction;
}

export function parseReviewDenialModalCustomId(customId: string) {
  const [prefix, scope, artistId, ...themeParts] = customId.split(':');

  if (`${prefix}:${scope}` !== REVIEW_DENIAL_MODAL_CUSTOM_ID_PREFIX) return null;

  const themeValue = themeParts.join(':');
  if (!artistId || !themeValue) return null;

  return { artistId, themeValue };
}

export function buildUserReceiptComponents(submission: SubmissionDisplayData) {
  const theme = resolveThemeOption(submission.themeValue);

  return [
    new ContainerBuilder()
      .setAccentColor(ART_SHOWCASE_PENDING_COLOR)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            '# Art Showcase Submission Received',
            'Your submission has been sent to staff for review.',
            'Status: Waiting',
            `Theme: ${theme?.label ?? submission.themeValue}`,
            `Images submitted: ${submission.images.length}`
          ].join('\n')
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addMediaGalleryComponents(buildMediaGallery(submission.images))
  ];
}

export function buildReviewMessageComponents(submission: SubmissionDisplayData, status: ReviewStatus) {
  const theme = resolveThemeOption(submission.themeValue);

  const container = new ContainerBuilder()
    .setAccentColor(resolveReviewAccentColor(status))
    .addSectionComponents(
      new SectionBuilder()
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(
            submission.artistAvatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'
          )
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            [
              '# Art Showcase Staff Review',
              `Artist: <@${submission.artistId}>`,
              `Theme: ${theme?.label ?? submission.themeValue}`
            ].join('\n')
          )
        )
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(buildOverviewText(submission, theme?.label ?? submission.themeValue)));

  container
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addMediaGalleryComponents(buildMediaGallery(submission.images))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

  if (status.state === 'pending') {
    container.addActionRowComponents(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(createReviewActionCustomId('approve', submission.artistId, submission.themeValue))
          .setLabel('Approve')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(createReviewActionCustomId('deny', submission.artistId, submission.themeValue))
          .setLabel('Deny')
          .setStyle(ButtonStyle.Danger)
      )
    );
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        buildReviewStatusText(status)
      )
    );
  }

  return [container];
}

export function buildPublishedMessageComponents(submission: SubmissionDisplayData) {
  const theme = resolveThemeOption(submission.themeValue);

  return [
    new ContainerBuilder()
      .setAccentColor(ART_SHOWCASE_APPROVED_COLOR)
      .addSectionComponents(
        new SectionBuilder()
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(
              submission.artistAvatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'
            )
          )
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              [
                '# Art Showcase',
                `Artist: <@${submission.artistId}>`,
                `Theme: ${theme?.label ?? submission.themeValue}`
              ].join('\n')
            )
          )
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addMediaGalleryComponents(buildMediaGallery(submission.images))
  ];
}

export function buildStatusContainerComponents(
  title: string,
  lines: string[],
  status: ReviewStatus['state'] = 'pending'
) {
  return [
    new ContainerBuilder()
      .setAccentColor(resolveReviewAccentColor({ state: status } as ReviewStatus))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent([`# ${title}`, ...lines].join('\n'))
      )
  ];
}

export function extractSubmissionImagesFromMessageComponents(components: readonly unknown[]) {
  const images: SubmissionImage[] = [];

  const visit = (component: unknown) => {
    if (!component || typeof component !== 'object') return;

    const candidate = component as {
      components?: unknown[];
      items?: Array<{ description?: string; media?: { url?: string } }>;
    };

    if (Array.isArray(candidate.items)) {
      for (const item of candidate.items) {
        if (!item.media?.url) continue;

        images.push({
          name: item.description || 'Submitted image',
          url: item.media.url
        });
      }
    }

    if (Array.isArray(candidate.components)) {
      for (const child of candidate.components) visit(child);
    }
  };

  for (const component of components) visit(component);

  return images;
}

export function buildDiscussionThreadName(prefix: string, artistName: string, themeValue: string) {
  const theme = resolveThemeOption(themeValue);
  return `${prefix} - ${artistName} - ${theme?.label ?? themeValue}`.slice(0, 100);
}

export function buildReviewThreadName(status: ReviewStatus['state'], artistName: string, themeValue: string) {
  const statusLabel = status === 'pending' ? 'Waiting' : status === 'approved' ? 'Approved' : 'Denied';
  return buildDiscussionThreadName(statusLabel, artistName, themeValue);
}

function buildMediaGallery(images: SubmissionImage[]) {
  return new MediaGalleryBuilder().addItems(
    images.map((image) => new MediaGalleryItemBuilder().setURL(image.url).setDescription(image.name))
  );
}

function buildOverviewText(submission: SubmissionDisplayData, themeLabel: string) {
  const lines = [
    '### Submission Overview',
    `- Artist: <@${submission.artistId}>`,
    `- Username: ${submission.artistName}`,
    `- User ID: ${submission.artistId}`,
    `- Theme: ${themeLabel}`,
    `- Images: ${submission.images.length}`
  ];

  if (submission.submittedAtTimestamp) {
    lines.push(`- Submitted: <t:${Math.floor(submission.submittedAtTimestamp / 1_000)}:F>`);
  }

  return lines.join('\n');
}

function resolveReviewAccentColor(status: ReviewStatus) {
  if (status.state === 'approved') return ART_SHOWCASE_APPROVED_COLOR;
  if (status.state === 'denied') return ART_SHOWCASE_DENIED_COLOR;
  return ART_SHOWCASE_PENDING_COLOR;
}

function buildReviewStatusText(status: ReviewStatus) {
  if (status.state === 'pending') return '### Review Status\nWaiting for staff review.';

  const lines = [
    '### Review Status',
    `${status.state === 'approved' ? 'Approved' : 'Denied'} by <@${status.reviewerId}>.`,
    `Reviewed at <t:${Math.floor(status.reviewedAtTimestamp / 1_000)}:F>.`
  ];

  if (status.state === 'denied' && status.denialReason) {
    lines.push(`Reason: ${status.denialReason}`);
  }

  return lines.join('\n');
}
