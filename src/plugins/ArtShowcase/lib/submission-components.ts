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
  ART_SHOWCASE_DETAIL_DOT,
  REVIEW_ACTION_CUSTOM_ID_PREFIX,
  REVIEW_DENIAL_MODAL_CUSTOM_ID_PREFIX,
  THEME_OPTIONS
} from '../constants';

const ART_SHOWCASE_PENDING_COLOR = 0xF8A44B;
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
  description: string;
  images: SubmissionImage[];
  submittedAtTimestamp?: number;
}

interface ReviewStatusPending {
  state: 'pending';
}

interface ReviewStatusResolved {
  state: 'approved' | 'denied';
  reviewedAtTimestamp: number;
  reviewerId: string;
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

export function formatDetailLine(label: string, value: string | number) {
  return `> ${ART_SHOWCASE_DETAIL_DOT} **${label}**: ${value}`;
}

export function formatPlainDetailLine(label: string, value: string | number) {
  return `${ART_SHOWCASE_DETAIL_DOT} **${label}**: ${value}`;
}

export function formatDetailText(value: string) {
  return `${ART_SHOWCASE_DETAIL_DOT} ${value}`;
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
            formatDetailLine('Status', 'Waiting for staff review'),
            formatDetailLine('Theme', theme?.label ?? submission.themeValue),
            formatDetailLine('Images submitted', submission.images.length)
          ].join('\n')
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true))
      .addMediaGalleryComponents(buildMediaGallery(submission.images))
  ];
}

export function buildSubmitterUpdateComponents(
  submission: SubmissionDisplayData,
  lines: string[],
  status: ReviewStatus['state'] = 'pending'
) {
  const { contentLines, denialReason } = splitDenialReason(lines);

  const container = new ContainerBuilder()
    .setAccentColor(resolveReviewAccentColor({ state: status } as ReviewStatus))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(['# Art Showcase Update', ...contentLines].join('\n'))
    );

  if (denialReason) {
    addDenialReasonSection(container, denialReason);
  }

  container
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true))
    .addMediaGalleryComponents(buildMediaGallery(submission.images));

  return [
    container
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
              '## Art Showcase Staff Review',
              formatPlainDetailLine('Artist', `<@${submission.artistId}>`),
              formatPlainDetailLine('Theme', theme?.label ?? submission.themeValue)
            ].join('\n')
          )
        )
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(buildOverviewText(submission, theme?.label ?? submission.themeValue)));

  container
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(buildDescriptionText(submission.description)))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true))
    .addMediaGalleryComponents(buildMediaGallery(submission.images))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true));

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
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(buildReviewStatusText(status)));

    if (status.state === 'denied' && status.denialReason) {
      addDenialReasonSection(container, status.denialReason);
    }
  }

  return [container];
}

export function buildPublishedMessageComponents(submission: SubmissionDisplayData) {
  const theme = resolveThemeOption(submission.themeValue);

  return [
    new ContainerBuilder()
      .setAccentColor(ART_SHOWCASE_PENDING_COLOR)
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
                '## Art Showcase',
                formatDetailLine('Artist', `<@${submission.artistId}>`),
                formatDetailLine('Theme', theme?.label ?? submission.themeValue)
              ].join('\n')
            )
          )
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true))
      .addMediaGalleryComponents(buildMediaGallery(submission.images))
  ];
}

export function buildStatusContainerComponents(
  title: string,
  lines: string[],
  status: ReviewStatus['state'] = 'pending'
) {
  const { contentLines, denialReason } = splitDenialReason(lines);

  const container = new ContainerBuilder()
    .setAccentColor(resolveReviewAccentColor({ state: status } as ReviewStatus))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([`# ${title}`, ...contentLines].join('\n'))
    );

  if (denialReason) {
    addDenialReasonSection(container, denialReason);
  }

  return [
    container
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

export function extractSubmissionDescriptionFromMessageComponents(components: readonly unknown[]) {
  let description: string | null = null;

  const visit = (component: unknown) => {
    if (!component || typeof component !== 'object' || description) return;

    const candidate = component as {
      components?: unknown[];
      content?: string;
    };

    if (typeof candidate.content === 'string') {
      const parsed = parseDescriptionFromTextContent(candidate.content);
      if (parsed) {
        description = parsed;
        return;
      }
    }

    if (Array.isArray(candidate.components)) {
      for (const child of candidate.components) visit(child);
    }
  };

  for (const component of components) visit(component);

  return description;
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
    formatDetailLine('Artist', `<@${submission.artistId}>`),
    formatDetailLine('Username', submission.artistName),
    formatDetailLine('User ID', submission.artistId),
    formatDetailLine('Theme', themeLabel),
    formatDetailLine('Images', submission.images.length)
  ];

  if (submission.submittedAtTimestamp) {
    lines.push(formatDetailLine('Submitted', `<t:${Math.floor(submission.submittedAtTimestamp / 1_000)}:F>`));
  }

  return lines.join('\n');
}

function buildDescriptionText(description: string) {
  return ['### Artist Description', `\`\`\`txt\n${description}\n\`\`\``].join('\n');
}

function resolveReviewAccentColor(status: ReviewStatus) {
  if (status.state === 'approved') return ART_SHOWCASE_APPROVED_COLOR;
  if (status.state === 'denied') return ART_SHOWCASE_DENIED_COLOR;
  return ART_SHOWCASE_PENDING_COLOR;
}

function splitDenialReason(lines: string[]) {
  const contentLines: string[] = [];
  let denialReason: string | null = null;

  for (const line of lines) {
    const normalizedLine = normalizeDetailLine(line);

    if (normalizedLine.startsWith('Reason: ')) {
      denialReason = normalizedLine.slice('Reason: '.length).trim() || 'No denial reason provided.';
      continue;
    }

    contentLines.push(line);
  }

  return { contentLines, denialReason };
}

function parseDescriptionFromTextContent(content: string) {
  const match = content.match(/### Artist Description\n```txt\n([\s\S]*?)\n```/);
  return match?.[1]?.trim() || null;
}

function addDenialReasonSection(container: ContainerBuilder, denialReason: string) {
  const formattedReason = denialReason.replace(/```/g, '```\u200b');

  container
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(['### Denial Reason', `\`\`\`txt\n${formattedReason}\n\`\`\``].join('\n'))
    );

  return container;
}

function buildReviewStatusText(status: ReviewStatus) {
  if (status.state === 'pending') return '### Review Status\nWaiting for staff review.';

  const lines = [
    '### Review Status',
    formatDetailLine('Status', status.state === 'approved' ? 'Approved' : 'Denied'),
    formatDetailLine('Reviewed by', `<@${status.reviewerId}>`),
    formatDetailLine('Reviewed at', `<t:${Math.floor(status.reviewedAtTimestamp / 1_000)}:F>`)
  ];

  return lines.join('\n');
}

function normalizeDetailLine(line: string) {
  if (line.startsWith(`${ART_SHOWCASE_DETAIL_DOT} `)) {
    return line.slice(ART_SHOWCASE_DETAIL_DOT.length + 1);
  }

  if (line.startsWith('- ')) {
    return line.slice(2);
  }

  return line;
}
