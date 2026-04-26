import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import {
  ART_SHOWCASE_REVIEWER_ROLE_IDS,
  ART_SHOWCASE_SUBMISSIONS_CHANNEL_ID,
  REVIEW_DENIAL_REASON_FIELD_ID
} from '../constants';
import {
  buildDiscussionThreadName,
  buildPublishedMessageComponents,
  buildReviewMessageComponents,
  buildReviewThreadName,
  buildStatusContainerComponents,
  createReviewDenialModalCustomId,
  extractSubmissionImagesFromMessageComponents,
  parseReviewActionCustomId,
  parseReviewDenialModalCustomId,
  type SubmissionDisplayData
} from '../lib/submission-components';
import {
  getErrorMessage,
  logArtShowcaseDebug,
  logArtShowcaseInfo,
  logArtShowcaseWarn
} from '../lib/logging';
import {
  ButtonInteraction,
  LabelBuilder,
  Message,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
  ThreadAutoArchiveDuration,
  type AnyThreadChannel,
  type SendableChannels
} from 'discord.js';

@ApplyOptions<Listener.Options>({ name: Events.InteractionCreate })
export class UserEvent extends Listener {
  public override async run(interaction: ButtonInteraction | ModalSubmitInteraction) {
    if (interaction.isButton()) {
      if (!interaction.inCachedGuild()) {
        await replyWithStatus(interaction, 'Review Unavailable', ['This review action can only be used inside the server.'], 'denied');
        return;
      }

      await this.handleButton(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      if (!interaction.inCachedGuild()) {
        await replyWithStatus(interaction, 'Review Unavailable', ['This review action can only be used inside the server.'], 'denied');
        return;
      }

      await this.handleDenialModal(interaction);
    }
  }

  private async handleButton(interaction: ButtonInteraction<'cached'>) {
    const reviewAction = parseReviewActionCustomId(interaction.customId);
    if (!reviewAction) return;

    logArtShowcaseInfo(this.container.logger, 'review.button.received', {
      action: reviewAction.action,
      artistId: reviewAction.artistId,
      messageId: interaction.message.id,
      reviewerId: interaction.user.id,
      themeValue: reviewAction.themeValue,
      threadId: interaction.channelId
    });

    if (!(await validateReviewer(this.container.logger, interaction, ART_SHOWCASE_REVIEWER_ROLE_IDS, reviewAction.action))) return;

    if (reviewAction.action === 'deny') {
      const modal = new ModalBuilder()
        .setCustomId(createReviewDenialModalCustomId(reviewAction.artistId, reviewAction.themeValue))
        .setTitle('Deny Art Submission')
        .addLabelComponents(
          new LabelBuilder()
            .setLabel('Denial Reason')
            .setDescription('Optional. This will be sent to the member via DM.')
            .setTextInputComponent(
              new TextInputBuilder()
                .setCustomId(REVIEW_DENIAL_REASON_FIELD_ID)
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
                .setMaxLength(1_000)
                .setPlaceholder('Explain why the submission was denied.')
            )
        );

      await interaction.showModal(modal);
      logArtShowcaseInfo(this.container.logger, 'review.deny-modal.opened', {
        artistId: reviewAction.artistId,
        reviewerId: interaction.user.id,
        themeValue: reviewAction.themeValue,
        threadId: interaction.channelId
      });
      return;
    }

    const submission = await getSubmissionFromMessage(this.container.client, interaction.message, reviewAction.artistId, reviewAction.themeValue);
    if (!submission) {
      await replyWithStatus(interaction, 'Submission Missing', ['The submission data could not be recovered from the review message.'], 'denied');
      return;
    }

    if (!ART_SHOWCASE_SUBMISSIONS_CHANNEL_ID) {
      await replyWithStatus(interaction, 'Channel Missing', ['The public submissions channel is not configured yet.'], 'denied');
      return;
    }

    const submissionsChannel = await fetchSendableChannel(this.container.client, ART_SHOWCASE_SUBMISSIONS_CHANNEL_ID);
    if (!submissionsChannel) {
      await replyWithStatus(interaction, 'Channel Invalid', ['The configured public submissions channel could not be used.'], 'denied');
      return;
    }

    const reviewedAtTimestamp = Date.now();

    await interaction.deferUpdate();
    logArtShowcaseInfo(this.container.logger, 'review.approve.started', {
      artistId: submission.artistId,
      reviewerId: interaction.user.id,
      themeValue: submission.themeValue,
      threadId: interaction.channelId
    });

    const publishedMessage = await submissionsChannel.send({
      components: buildPublishedMessageComponents(submission),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: {
        parse: [],
        users: [submission.artistId]
      }
    });

    await publishedMessage.react('✅');
    await publishedMessage.react('❌');

    logArtShowcaseInfo(this.container.logger, 'review.approve.published', {
      artistId: submission.artistId,
      publishedMessageId: publishedMessage.id,
      reviewerId: interaction.user.id,
      submissionChannelId: ART_SHOWCASE_SUBMISSIONS_CHANNEL_ID,
      themeValue: submission.themeValue
    });

    await publishedMessage.startThread({
      name: buildDiscussionThreadName('Art Discussion', submission.artistName, submission.themeValue),
      autoArchiveDuration: ThreadAutoArchiveDuration.OneDay
    });

    await interaction.message.edit({
      components: buildReviewMessageComponents(submission, {
        state: 'approved',
        reviewerId: interaction.user.id,
        reviewerName: interaction.user.username,
        reviewedAtTimestamp
      }),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] }
    });

    const reviewThread = fetchReviewThread(interaction.message);
    if (reviewThread) {
      await reviewThread.setName(buildReviewThreadName('approved', submission.artistName, submission.themeValue));
      await reviewThread.send({
        components: buildStatusContainerComponents(
          'Submission Approved',
          [
            `Approved by <@${interaction.user.id}>.`,
            `Approved at <t:${Math.floor(reviewedAtTimestamp / 1_000)}:F>.`,
            `Published to <#${ART_SHOWCASE_SUBMISSIONS_CHANNEL_ID}>.`
          ],
          'approved'
        ),
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] }
      });
      await reviewThread.setLocked(true, 'Art Showcase submission reviewed');
      await reviewThread.setArchived(true, 'Art Showcase submission reviewed');

      logArtShowcaseInfo(this.container.logger, 'review.approve.thread-closed', {
        reviewThreadId: reviewThread.id,
        reviewerId: interaction.user.id
      });
    }

    await notifyMember(this.container.logger, submission.artistId, this.container.client, [
      'Your Art Showcase submission was approved.',
      `Theme: ${resolveThemeLabel(submission.themeValue)}`,
      `Approved by ${interaction.user.username}.`,
      `Approved at <t:${Math.floor(reviewedAtTimestamp / 1_000)}:F>.`,
      `It is now live in <#${ART_SHOWCASE_SUBMISSIONS_CHANNEL_ID}>.`
    ]);

    logArtShowcaseInfo(this.container.logger, 'review.approve.completed', {
      artistId: submission.artistId,
      reviewerId: interaction.user.id,
      themeValue: submission.themeValue
    });

    await interaction.followUp({
      components: buildStatusContainerComponents(
        'Submission Approved',
        [`Submission approved and posted to <#${ART_SHOWCASE_SUBMISSIONS_CHANNEL_ID}>.`],
        'approved'
      ),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] }
    });
  }

  private async handleDenialModal(interaction: ModalSubmitInteraction<'cached'>) {
    const denialModal = parseReviewDenialModalCustomId(interaction.customId);
    if (!denialModal) return;

    logArtShowcaseInfo(this.container.logger, 'review.deny-modal.submitted', {
      artistId: denialModal.artistId,
      reviewerId: interaction.user.id,
      themeValue: denialModal.themeValue,
      threadId: interaction.channelId
    });

    if (!(await validateReviewer(this.container.logger, interaction, ART_SHOWCASE_REVIEWER_ROLE_IDS, 'deny-modal'))) return;

    if (!interaction.isFromMessage() || !interaction.message) {
      await replyWithStatus(interaction, 'Review Missing', ['The denial modal is no longer connected to a review message.'], 'denied');
      return;
    }

    const submission = await getSubmissionFromMessage(
      this.container.client,
      interaction.message,
      denialModal.artistId,
      denialModal.themeValue
    );
    if (!submission) {
      await replyWithStatus(interaction, 'Submission Missing', ['The submission data could not be recovered from the review message.'], 'denied');
      return;
    }

    const reviewedAtTimestamp = Date.now();
    const denialReason = interaction.fields.getTextInputValue(REVIEW_DENIAL_REASON_FIELD_ID).trim();

    logArtShowcaseDebug(this.container.logger, 'review.deny.reason-captured', {
      artistId: submission.artistId,
      reasonLength: denialReason.length,
      reviewerId: interaction.user.id
    });

    await interaction.update({
      components: buildReviewMessageComponents(submission, {
        state: 'denied',
        reviewerId: interaction.user.id,
        reviewerName: interaction.user.username,
        reviewedAtTimestamp,
        denialReason: denialReason || undefined
      }),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] }
    });

    const reviewThread = fetchReviewThread(interaction.message);
    if (reviewThread) {
      await reviewThread.setName(buildReviewThreadName('denied', submission.artistName, submission.themeValue));
      await reviewThread.send({
        components: buildStatusContainerComponents(
          'Submission Denied',
          [
            `Denied by <@${interaction.user.id}>.`,
            `Denied at <t:${Math.floor(reviewedAtTimestamp / 1_000)}:F>.`,
            denialReason ? `Reason: ${denialReason}` : 'Reason: No denial reason provided.'
          ],
          'denied'
        ),
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] }
      });
      await reviewThread.setLocked(true, 'Art Showcase submission reviewed');
      await reviewThread.setArchived(true, 'Art Showcase submission reviewed');

      logArtShowcaseInfo(this.container.logger, 'review.deny.thread-closed', {
        reviewThreadId: reviewThread.id,
        reviewerId: interaction.user.id
      });
    }

    await notifyMember(this.container.logger, submission.artistId, this.container.client, [
      'Your Art Showcase submission was denied.',
      `Theme: ${resolveThemeLabel(submission.themeValue)}`,
      `Denied by ${interaction.user.username}.`,
      `Denied at <t:${Math.floor(reviewedAtTimestamp / 1_000)}:F>.`,
      denialReason ? `Reason: ${denialReason}` : 'No denial reason was provided.'
    ]);

    logArtShowcaseInfo(this.container.logger, 'review.deny.completed', {
      artistId: submission.artistId,
      denialReasonProvided: denialReason.length > 0,
      reviewerId: interaction.user.id,
      themeValue: submission.themeValue
    });

    await interaction.followUp({
      components: buildStatusContainerComponents('Submission Denied', ['Submission denied.'], 'denied'),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    });
  }
}

async function getSubmissionFromMessage(
  client: Listener['container']['client'],
  sourceMessage: Message,
  artistId: string,
  themeValue: string
) {
  const images = extractSubmissionImagesFromMessageComponents(sourceMessage.components);
  if (images.length === 0) return null;

  const artist = await client.users.fetch(artistId).catch(() => null);

  return {
    artistId,
    artistName: artist?.username ?? artistId,
    artistAvatarUrl: artist?.displayAvatarURL({ extension: 'png' }) ?? null,
    themeValue,
    images,
    submittedAtTimestamp: sourceMessage.createdTimestamp
  } satisfies SubmissionDisplayData;
}

async function validateReviewer(
  logger: Listener['container']['logger'],
  interaction: ButtonInteraction<'cached'> | ModalSubmitInteraction<'cached'>,
  reviewerRoleIds: readonly string[],
  action: string
) {
  if (reviewerRoleIds.length === 0) {
    logArtShowcaseWarn(logger, 'review.reviewer-roles.missing', {
      action,
      reviewerId: interaction.user.id
    });
    await replyWithStatus(interaction, 'Roles Missing', ['Art Showcase reviewer roles are not configured yet.'], 'denied');
    return false;
  }

  const hasReviewerRole = reviewerRoleIds.some((roleId) => interaction.member.roles.cache.has(roleId));
  if (!hasReviewerRole) {
    logArtShowcaseWarn(logger, 'review.permission-denied', {
      action,
      reviewerId: interaction.user.id,
      threadId: interaction.channelId
    });
    await replyWithStatus(interaction, 'Permission Denied', ['You do not have permission to review Art Showcase submissions.'], 'denied');
    return false;
  }

  return true;
}

async function notifyMember(logger: Listener['container']['logger'], artistId: string, client: Listener['container']['client'], lines: string[]) {
  const user = await client.users.fetch(artistId).catch(() => null);
  if (!user) {
    logArtShowcaseWarn(logger, 'member-notify.user-not-found', { artistId });
    return;
  }

  const state = lines[0]?.toLowerCase().includes('approved')
    ? 'approved'
    : lines[0]?.toLowerCase().includes('denied')
      ? 'denied'
      : 'pending';

  await user.send({
    components: buildStatusContainerComponents('Art Showcase Update', lines, state),
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] }
  }).then(() => {
    logArtShowcaseDebug(logger, 'member-notify.sent', { artistId, state });
  }).catch((error) => {
    logArtShowcaseWarn(logger, 'member-notify.failed', { artistId, error: getErrorMessage(error), state });
    return null;
  });
}

function fetchReviewThread(sourceMessage: Message) {
  return (sourceMessage.thread ?? null) as AnyThreadChannel | null;
}

function resolveThemeLabel(themeValue: string) {
  if (themeValue === 'bot-inspired') return 'Bot Inspired';
  if (themeValue === 'server-inspired') return 'Server Inspired';
  if (themeValue === 'ntts-inspired') return 'NTTS Inspired';
  return themeValue;
}

async function fetchSendableChannel(client: Listener['container']['client'], channelId: string) {
  const channel = await client.channels.fetch(channelId).catch(() => null);

  if (!channel || !channel.isTextBased() || !('send' in channel)) return null;

  return channel as SendableChannels;
}

async function replyWithStatus(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  title: string,
  lines: string[],
  state: 'pending' | 'approved' | 'denied'
) {
  await interaction.reply({
    components: buildStatusContainerComponents(title, lines, state),
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
  });
}
