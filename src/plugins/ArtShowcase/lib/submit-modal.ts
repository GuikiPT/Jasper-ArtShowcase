import {
  ART_SHOWCASE_AUTOMOD_LOG_CHANNEL_ID,
  ART_SHOWCASE_BLACKLIST_ROLE_IDS,
  ART_SHOWCASE_MINIMUM_SUBMIT_ROLE_ID,
  ART_SHOWCASE_MINIMUM_SUBMIT_ROLE_MENTION,
  ART_SHOWCASE_REVIEW_PING_ROLE_IDS,
  ART_SHOWCASE_SUBMISSION_COOLDOWN_MINUTES,
  ART_SHOWCASE_SUBMISSION_LOG_CHANNEL_ID,
  ART_SHOWCASE_SUBMIT_WHITELIST_ROLE_IDS,
  DESCRIPTION_FIELD_ID,
  DESCRIPTION_MAX_LENGTH,
  IMAGE_FIELD_ID,
  SUBMIT_MODAL_ID,
  THEME_FIELD_ID,
  THEME_OPTIONS
} from '../constants';
import { checkSubmissionDescriptionAgainstAutomod } from './submission-automod';
import {
  buildBlockedSubmissionLogComponents,
  buildReviewThreadName,
  buildReviewMessageComponents,
  buildStatusContainerComponents,
  buildSubmitterUpdateComponents,
  buildUserReceiptComponents,
  formatDetailLine,
  type SubmissionDisplayData
} from './submission-components';
import { createArtistIdentity } from './artist-identity';
import {
  getErrorMessage,
  logArtShowcaseDebug,
  logArtShowcaseError,
  logArtShowcaseInfo,
  logArtShowcaseWarn
} from './logging';
import { getSubmissionCooldownExpiresAt, setSubmissionCooldown } from './submission-cooldown';
import {
  MessageFlags,
  ThreadAutoArchiveDuration,
  type Client,
  type ModalSubmitInteraction,
  type SendableChannels
} from 'discord.js';

type LoggerLike = {
  debug: (...values: unknown[]) => void;
  error: (...values: unknown[]) => void;
  info: (...values: unknown[]) => void;
  warn: (...values: unknown[]) => void;
};

type HandleArtShowcaseSubmitModalOptions = {
  client: Client<boolean>;
  interaction: ModalSubmitInteraction<'cached'>;
  logger: LoggerLike;
};

export function isArtShowcaseSubmitModal(customId: string) {
  return customId.startsWith(`${SUBMIT_MODAL_ID}:`);
}

export async function handleArtShowcaseSubmitModal({
  client,
  interaction,
  logger
}: HandleArtShowcaseSubmitModalOptions) {
  logArtShowcaseInfo(logger, 'submit.modal.received', {
    channelId: interaction.channelId,
    guildId: interaction.guildId,
    userId: interaction.user.id
  });

  if (hasBlacklistedRole(interaction.member.roles.cache.map((role) => role.id))) {
    logArtShowcaseWarn(logger, 'submit.modal.blacklisted', {
      blacklistRoleCount: ART_SHOWCASE_BLACKLIST_ROLE_IDS.length,
      userId: interaction.user.id
    });

    await interaction.reply({
      components: buildStatusContainerComponents(
        'Submission Blocked',
        ['You are not allowed to submit artwork to Art Showcase.'],
        'denied'
      ),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] }
    });
    return;
  }

  if (!hasWhitelistedSubmitRole(interaction.member.roles.cache.map((role) => role.id))) {
    logArtShowcaseWarn(logger, 'submit.modal.whitelist-blocked', {
      minimumSubmitRoleId: ART_SHOWCASE_MINIMUM_SUBMIT_ROLE_ID,
      whitelistRoleCount: ART_SHOWCASE_SUBMIT_WHITELIST_ROLE_IDS.length,
      userId: interaction.user.id
    });

    await interaction.reply({
      components: buildStatusContainerComponents(
        'Submission Blocked',
        [`You need at least the ${ART_SHOWCASE_MINIMUM_SUBMIT_ROLE_MENTION} role to submit artwork to Art Showcase.`],
        'denied'
      ),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] }
    });
    return;
  }

  const cooldownExpiresAt = getSubmissionCooldownExpiresAt(interaction.user.id);
  if (cooldownExpiresAt) {
    logArtShowcaseWarn(logger, 'submit.modal.cooldown-active', {
      cooldownExpiresAt,
      cooldownMinutes: ART_SHOWCASE_SUBMISSION_COOLDOWN_MINUTES,
      userId: interaction.user.id
    });

    await interaction.reply({
      components: buildStatusContainerComponents(
        'Submission Cooldown',
        [
          `You recently submitted artwork. Try again <t:${Math.floor(cooldownExpiresAt / 1_000)}:R>.`,
          `The submission cooldown is ${ART_SHOWCASE_SUBMISSION_COOLDOWN_MINUTES} minutes.`
        ],
        'pending'
      ),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] }
    });
    return;
  }

  try {
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral
    });

    const selectedThemeValue = interaction.fields.getStringSelectValues(THEME_FIELD_ID)[0];
    const selectedTheme = THEME_OPTIONS.find((theme) => theme.value === selectedThemeValue);
    const description = interaction.fields.getTextInputValue(DESCRIPTION_FIELD_ID).trim();
    const uploadedFiles = [...interaction.fields.getUploadedFiles(IMAGE_FIELD_ID, true).values()];
    const descriptionAutomodMatch = checkSubmissionDescriptionAgainstAutomod(description, {
      channelId: interaction.channelId ?? '',
      memberRoleIds: interaction.member.roles.cache.map((role) => role.id)
    });

    logArtShowcaseInfo(logger, 'submit.payload.parsed', {
      descriptionLength: description.length,
      imageCount: uploadedFiles.length,
      themeValue: selectedTheme?.value,
      userId: interaction.user.id
    });

    if (
      !selectedTheme ||
      uploadedFiles.length === 0 ||
      description.length === 0 ||
      description.length > DESCRIPTION_MAX_LENGTH
    ) {
      logArtShowcaseWarn(logger, 'submit.payload.invalid', {
        descriptionLength: description.length,
        imageCount: uploadedFiles.length,
        themeValue: selectedTheme?.value,
        userId: interaction.user.id
      });

      await interaction.editReply({
        components: buildStatusContainerComponents(
          'Submission Failed',
          description.length > DESCRIPTION_MAX_LENGTH
            ? [`The description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer. Please run the command again.`]
            : ['The submission could not be processed. Please try again.'],
          'denied'
        ),
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] }
      });
      return;
    }

    if (descriptionAutomodMatch) {
      logArtShowcaseWarn(logger, 'submit.description.blocked-by-automod', {
        matchedBy: descriptionAutomodMatch.matchedBy,
        ruleName: descriptionAutomodMatch.ruleName,
        userId: interaction.user.id
      });

      await interaction.editReply({
        components: buildStatusContainerComponents(
          'Submission Blocked',
          ['Your submission description matches the server blacklist and could not be submitted.'],
          'denied'
        ),
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] }
      });

      await sendAutomodLog({
        description,
        images: uploadedFiles.map((file) => ({ name: file.name, url: file.url })),
        interaction,
        matchedBy: descriptionAutomodMatch.matchedBy,
        matchedValue: descriptionAutomodMatch.matchedValue,
        ruleName: descriptionAutomodMatch.ruleName,
        selectedThemeValue
      }).catch(() => null);
      return;
    }

    const invalidFiles = uploadedFiles.filter((file) => !file.contentType?.startsWith('image/'));

    if (invalidFiles.length > 0) {
      logArtShowcaseWarn(logger, 'submit.payload.non-image-files', {
        invalidFileCount: invalidFiles.length,
        userId: interaction.user.id
      });

      await interaction.editReply({
        components: buildStatusContainerComponents(
          'Submission Failed',
          [
            'Only image uploads are allowed. Please remove the non-image files and try again.',
            ...invalidFiles.map((file) => formatDetailLine('File', file.name))
          ],
          'denied'
        ),
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] }
      });
      return;
    }

    const reviewLogChannel = await fetchSendableChannel(client, ART_SHOWCASE_SUBMISSION_LOG_CHANNEL_ID);
    if (!reviewLogChannel) {
      logArtShowcaseError(logger, 'submit.log-channel.invalid', new Error('Review log channel is not sendable.'), {
        channelId: ART_SHOWCASE_SUBMISSION_LOG_CHANNEL_ID,
        userId: interaction.user.id
      });

      await interaction.editReply({
        components: buildStatusContainerComponents(
          'Submission Failed',
          ['The Art Showcase log channel is configured incorrectly.'],
          'denied'
        ),
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] }
      });
      return;
    }

    logArtShowcaseInfo(logger, 'submit.log-channel.resolved', {
      channelId: reviewLogChannel.id,
      userId: interaction.user.id
    });

    const artistIdentity = createArtistIdentity(interaction.user, interaction.member);

    const submissionData: SubmissionDisplayData = {
      ...artistIdentity,
      themeValue: selectedTheme.value,
      description,
      images: uploadedFiles.map((file) => ({ name: file.name, url: file.url })),
      submittedAtTimestamp: interaction.createdTimestamp
    };

    logArtShowcaseDebug(logger, 'submit.payload.prepared', {
      descriptionLength: submissionData.description.length,
      imageCount: submissionData.images.length,
      userId: interaction.user.id
    });

    const reviewMessage = await reviewLogChannel.send({
      components: buildReviewMessageComponents(submissionData, { state: 'pending' }),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] }
    });

    logArtShowcaseInfo(logger, 'submit.review-message.created', {
      imageCount: submissionData.images.length,
      reviewMessageId: reviewMessage.id,
      themeValue: submissionData.themeValue,
      userId: interaction.user.id
    });

    await reviewMessage.react('✅');
    await reviewMessage.react('❌');

    logArtShowcaseDebug(logger, 'submit.review-message.reactions-added', {
      reviewMessageId: reviewMessage.id,
      userId: interaction.user.id
    });

    const reviewThread = await reviewMessage.startThread({
      name: buildReviewThreadName('pending', interaction.user.username, selectedTheme.value),
      autoArchiveDuration: ThreadAutoArchiveDuration.OneDay
    });

    logArtShowcaseInfo(logger, 'submit.review-thread.created', {
      reviewThreadId: reviewThread.id,
      reviewMessageId: reviewMessage.id,
      userId: interaction.user.id
    });

    const cooldownSetExpiresAt = setSubmissionCooldown(interaction.user.id);
    logArtShowcaseDebug(logger, 'submit.cooldown.set', {
      cooldownExpiresAt: cooldownSetExpiresAt,
      cooldownMinutes: ART_SHOWCASE_SUBMISSION_COOLDOWN_MINUTES,
      userId: interaction.user.id
    });

    const reviewerMentions = ART_SHOWCASE_REVIEW_PING_ROLE_IDS.map((roleId) => `<@&${roleId}>`).join(' ');
    if (reviewerMentions) {
      logArtShowcaseDebug(logger, 'submit.review-thread.ping-started', {
        reviewThreadId: reviewThread.id,
        roleCount: ART_SHOWCASE_REVIEW_PING_ROLE_IDS.length,
        userId: interaction.user.id
      });

      await reviewThread.send({
        content: reviewerMentions,
        allowedMentions: {
          parse: [],
          roles: ART_SHOWCASE_REVIEW_PING_ROLE_IDS
        }
      });

      logArtShowcaseDebug(logger, 'submit.review-thread.ping-sent', {
        reviewThreadId: reviewThread.id,
        roleCount: ART_SHOWCASE_REVIEW_PING_ROLE_IDS.length,
        userId: interaction.user.id
      });
    }

    logArtShowcaseDebug(logger, 'submit.waiting-dm.started', {
      reviewThreadId: reviewThread.id,
      userId: interaction.user.id
    });

    await interaction.user
      .send({
        components: buildSubmitterUpdateComponents(
          submissionData,
          [
            'Your Art Showcase submission has been received.',
            formatDetailLine('Status', 'Waiting for staff review'),
            formatDetailLine('Theme', selectedTheme.label),
            formatDetailLine('Images submitted', submissionData.images.length)
          ],
          'pending'
        ),
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] }
      })
      .then(() => {
        logArtShowcaseDebug(logger, 'submit.waiting-dm.sent', {
          userId: interaction.user.id
        });
      })
      .catch((error) => {
        logArtShowcaseWarn(logger, 'submit.waiting-dm.failed', {
          error: getErrorMessage(error),
          userId: interaction.user.id
        });
        return null;
      });

    await interaction.editReply({
      components: buildUserReceiptComponents(submissionData),
      flags: MessageFlags.IsComponentsV2
    });

    logArtShowcaseDebug(logger, 'submit.receipt.updated', {
      reviewMessageId: reviewMessage.id,
      userId: interaction.user.id
    });

    logArtShowcaseInfo(logger, 'submit.completed', {
      reviewMessageId: reviewMessage.id,
      reviewThreadId: reviewThread.id,
      userId: interaction.user.id
    });
  } catch (error) {
    logArtShowcaseError(logger, 'submit.failed', error, {
      userId: interaction.user.id
    });

    if (interaction.deferred || interaction.replied) {
      await interaction
        .editReply({
          components: buildStatusContainerComponents(
            'Submission Failed',
            ['The submission could not be fully processed. Please try again or contact staff if this keeps happening.'],
            'denied'
          ),
          flags: MessageFlags.IsComponentsV2,
          allowedMentions: { parse: [] }
        })
        .catch(() => null);

      return;
    }

    await interaction
      .reply({
        components: buildStatusContainerComponents(
          'Submission Failed',
          ['The submission could not be fully processed. Please try again or contact staff if this keeps happening.'],
          'denied'
        ),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] }
      })
      .catch(() => null);
  }
}

async function fetchSendableChannel(client: Client<boolean>, channelId: string) {
  const channel = await client.channels.fetch(channelId).catch(() => null);

  if (!channel || !channel.isTextBased() || !('send' in channel)) return null;

  return channel as SendableChannels;
}

function hasBlacklistedRole(memberRoleIds: readonly string[]) {
  return ART_SHOWCASE_BLACKLIST_ROLE_IDS.some((roleId) => memberRoleIds.includes(roleId));
}

function hasWhitelistedSubmitRole(memberRoleIds: readonly string[]) {
  return ART_SHOWCASE_SUBMIT_WHITELIST_ROLE_IDS.some((roleId) => memberRoleIds.includes(roleId));
}

async function sendAutomodLog({
  description,
  images,
  interaction,
  matchedBy,
  matchedValue,
  ruleName,
  selectedThemeValue,
}: {
  description: string;
  images: SubmissionDisplayData['images'];
  interaction: ModalSubmitInteraction<'cached'>;
  matchedBy: 'keyword' | 'regex';
  matchedValue: string;
  ruleName: string;
  selectedThemeValue: string;
}) {
  if (!ART_SHOWCASE_AUTOMOD_LOG_CHANNEL_ID) return;

  const automodLogChannel = await fetchSendableChannel(interaction.client, ART_SHOWCASE_AUTOMOD_LOG_CHANNEL_ID);
  if (!automodLogChannel) return;

  const blockedSubmission: SubmissionDisplayData = {
    ...createArtistIdentity(interaction.user, interaction.member),
    themeValue: selectedThemeValue,
    description,
    images,
    submittedAtTimestamp: interaction.createdTimestamp
  };

  await automodLogChannel.send({
    components: buildBlockedSubmissionLogComponents(blockedSubmission, {
      detectionType: matchedBy === 'regex' ? 'Regex blacklist' : 'Word blacklist',
      matchedPattern: matchedValue,
      ruleName,
      sourceChannelId: interaction.channelId
    }),
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] }
  });
}
