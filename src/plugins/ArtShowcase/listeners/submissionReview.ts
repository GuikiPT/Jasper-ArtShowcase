import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import {
  ART_SHOWCASE_REVIEWER_ROLE_IDS,
  ART_SHOWCASE_SUBMISSIONS_CHANNEL_ID,
  REVIEW_DENIAL_REASON_FIELD_ID
} from '../constants';
import { handleArtShowcaseSubmitModal, isArtShowcaseSubmitModal } from '../lib/submit-modal';
import {
  buildDiscussionThreadName,
  buildPublishedMessageComponents,
  buildReviewMessageComponents,
  buildReviewThreadName,
  buildStatusContainerComponents,
  buildSubmitterUpdateComponents,
  createReviewDenialModalCustomId,
  extractReviewStateFromMessageComponents,
  extractSubmissionDescriptionFromMessageComponents,
  extractSubmissionImagesFromMessageComponents,
  formatDetailLine,
  parseReviewActionCustomId,
  parseReviewDenialModalCustomId,
  type SubmissionDisplayData
} from '../lib/submission-components';
import {
  getErrorMessage,
  logArtShowcaseDebug,
  logArtShowcaseError,
  logArtShowcaseInfo,
  logArtShowcaseWarn
} from '../lib/logging';
import { fetchArtistIdentity } from '../lib/artist-identity';
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

const activeReviewActions = new Set<string>();

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

      if (isArtShowcaseSubmitModal(interaction.customId)) {
        await handleArtShowcaseSubmitModal({
          client: this.container.client,
          interaction,
          logger: this.container.logger
        });
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

    const reviewState = extractReviewStateFromMessageComponents(interaction.message.components);
    if (reviewState && reviewState !== 'pending') {
      await replyWithStatus(interaction, 'Already Reviewed', [`This submission was already ${reviewState}.`], reviewState);
      return;
    }

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

    logArtShowcaseDebug(this.container.logger, 'review.approve.submission-recovered', {
      artistId: submission.artistId,
      imageCount: submission.images.length,
      reviewerId: interaction.user.id,
      themeValue: submission.themeValue
    });

    if (!ART_SHOWCASE_SUBMISSIONS_CHANNEL_ID) {
      await replyWithStatus(interaction, 'Channel Missing', ['The public submissions channel is not configured yet.'], 'denied');
      return;
    }

    const submissionsChannel = await fetchSendableChannel(this.container.client, ART_SHOWCASE_SUBMISSIONS_CHANNEL_ID);
    if (!submissionsChannel) {
      await replyWithStatus(interaction, 'Channel Invalid', ['The configured public submissions channel could not be used.'], 'denied');
      return;
    }

    logArtShowcaseDebug(this.container.logger, 'review.approve.channel-resolved', {
      reviewerId: interaction.user.id,
      submissionChannelId: submissionsChannel.id
    });

    if (!beginReviewAction(interaction.message.id)) {
      await replyWithStatus(interaction, 'Review In Progress', ['Another reviewer action is already processing for this submission.'], 'pending');
      return;
    }

    const reviewedAtTimestamp = Date.now();

    let publishedMessage: Message | null = null;
    let discussionThread: AnyThreadChannel | null = null;

    try {
      await interaction.deferUpdate();
      logArtShowcaseInfo(this.container.logger, 'review.approve.started', {
        artistId: submission.artistId,
        reviewerId: interaction.user.id,
        themeValue: submission.themeValue,
        threadId: interaction.channelId
      });

      const createdPublishedMessage = await submissionsChannel.send({
        components: buildPublishedMessageComponents(submission),
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: {
          parse: [],
          users: [submission.artistId]
        }
      });
      publishedMessage = createdPublishedMessage;

      await createdPublishedMessage.react('✅');
      await createdPublishedMessage.react('❌');

      logArtShowcaseDebug(this.container.logger, 'review.approve.public-reactions-added', {
        publishedMessageId: createdPublishedMessage.id,
        reviewerId: interaction.user.id
      });

      logArtShowcaseInfo(this.container.logger, 'review.approve.published', {
        artistId: submission.artistId,
        publishedMessageId: createdPublishedMessage.id,
        reviewerId: interaction.user.id,
        submissionChannelId: ART_SHOWCASE_SUBMISSIONS_CHANNEL_ID,
        themeValue: submission.themeValue
      });

      discussionThread = await createdPublishedMessage.startThread({
        name: buildDiscussionThreadName('Art Discussion', submission.artistName, submission.themeValue),
        autoArchiveDuration: ThreadAutoArchiveDuration.OneDay
      });

      logArtShowcaseInfo(this.container.logger, 'review.approve.discussion-thread.created', {
        discussionThreadId: discussionThread.id,
        publishedMessageId: createdPublishedMessage.id,
        reviewerId: interaction.user.id
      });

      await interaction.message.edit({
        components: buildReviewMessageComponents(submission, {
          state: 'approved',
          reviewedAtTimestamp,
          reviewerId: interaction.user.id
        }),
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] }
      });

      logArtShowcaseInfo(this.container.logger, 'review.approve.review-message.updated', {
        reviewMessageId: interaction.message.id,
        reviewerId: interaction.user.id,
        status: 'approved'
      });

      const reviewThread = fetchReviewThread(interaction.message);
      if (reviewThread) {
        await reviewThread.setName(buildReviewThreadName('approved', submission.artistName, submission.themeValue));
        logArtShowcaseDebug(this.container.logger, 'review.approve.thread-renamed', {
          reviewThreadId: reviewThread.id,
          reviewerId: interaction.user.id
        });

        await reviewThread.send({
          components: buildStatusContainerComponents(
            'Submission Approved',
            [
              'The submission was approved.',
              formatDetailLine('Reviewed by', `<@${interaction.user.id}>`),
              formatDetailLine('Approved at', `<t:${Math.floor(reviewedAtTimestamp / 1_000)}:F>`),
              formatDetailLine('Published to', `<#${ART_SHOWCASE_SUBMISSIONS_CHANNEL_ID}>`)
            ],
            'approved'
          ),
          flags: MessageFlags.IsComponentsV2,
          allowedMentions: { parse: [] }
        });

        logArtShowcaseDebug(this.container.logger, 'review.approve.thread-status-sent', {
          reviewThreadId: reviewThread.id,
          reviewerId: interaction.user.id
        });

        await reviewThread.setLocked(true, 'Art Showcase submission reviewed');
        logArtShowcaseDebug(this.container.logger, 'review.approve.thread-locked', {
          reviewThreadId: reviewThread.id,
          reviewerId: interaction.user.id
        });

        await reviewThread.setArchived(true, 'Art Showcase submission reviewed');
        logArtShowcaseDebug(this.container.logger, 'review.approve.thread-archived', {
          reviewThreadId: reviewThread.id,
          reviewerId: interaction.user.id
        });

        logArtShowcaseInfo(this.container.logger, 'review.approve.thread-closed', {
          reviewThreadId: reviewThread.id,
          reviewerId: interaction.user.id
        });
      }

      await notifyMember(this.container.logger, submission, this.container.client, [
        'Your Art Showcase submission was approved.',
        formatDetailLine('Theme', resolveThemeLabel(submission.themeValue)),
        formatDetailLine('Approved at', `<t:${Math.floor(reviewedAtTimestamp / 1_000)}:F>`),
        formatDetailLine('Published to', `<#${ART_SHOWCASE_SUBMISSIONS_CHANNEL_ID}>`)
      ], 'approved', interaction.user.id);

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

      logArtShowcaseDebug(this.container.logger, 'review.approve.follow-up.sent', {
        reviewerId: interaction.user.id,
        reviewMessageId: interaction.message.id
      });
    } catch (error) {
      logArtShowcaseError(this.container.logger, 'review.approve.failed', error, {
        artistId: submission.artistId,
        publishedMessageId: publishedMessage?.id,
        reviewerId: interaction.user.id,
        reviewMessageId: interaction.message.id,
        themeValue: submission.themeValue
      });

      if (discussionThread) {
        await discussionThread.delete('Rolling back failed Art Showcase approval').catch(() => null);
      }

      if (publishedMessage) {
        await publishedMessage.delete().catch(() => null);
        logArtShowcaseWarn(this.container.logger, 'review.approve.rollback.deleted-public-message', {
          publishedMessageId: publishedMessage.id,
          reviewerId: interaction.user.id
        });
      }

      await interaction.followUp({
        components: buildStatusContainerComponents(
          'Approval Failed',
          ['The submission could not be approved. No public post was kept, so it is safe to retry.'],
          'denied'
        ),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] }
      }).catch(() => null);
    } finally {
      endReviewAction(interaction.message.id);
    }
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

    const reviewState = extractReviewStateFromMessageComponents(interaction.message.components);
    if (reviewState && reviewState !== 'pending') {
      await replyWithStatus(interaction, 'Already Reviewed', [`This submission was already ${reviewState}.`], reviewState);
      return;
    }

    if (!beginReviewAction(interaction.message.id)) {
      await replyWithStatus(interaction, 'Review In Progress', ['Another reviewer action is already processing for this submission.'], 'pending');
      return;
    }

    try {
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

      logArtShowcaseDebug(this.container.logger, 'review.deny.submission-recovered', {
        artistId: submission.artistId,
        imageCount: submission.images.length,
        reviewerId: interaction.user.id,
        themeValue: submission.themeValue
      });

      const reviewedAtTimestamp = Date.now();
      const denialReason = interaction.fields.getTextInputValue(REVIEW_DENIAL_REASON_FIELD_ID).trim();
      const normalizedDenialReason = denialReason || 'No denial reason provided.';

      logArtShowcaseDebug(this.container.logger, 'review.deny.reason-captured', {
        artistId: submission.artistId,
        reasonLength: denialReason.length,
        reviewerId: interaction.user.id
      });

      await interaction.update({
        components: buildReviewMessageComponents(submission, {
          state: 'denied',
          reviewedAtTimestamp,
          reviewerId: interaction.user.id,
          denialReason: normalizedDenialReason
        }),
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] }
      });

      logArtShowcaseInfo(this.container.logger, 'review.deny.review-message.updated', {
        reviewMessageId: interaction.message.id,
        reviewerId: interaction.user.id,
        status: 'denied'
      });

      const reviewThread = fetchReviewThread(interaction.message);
      if (reviewThread) {
        await reviewThread.setName(buildReviewThreadName('denied', submission.artistName, submission.themeValue));
        logArtShowcaseDebug(this.container.logger, 'review.deny.thread-renamed', {
          reviewThreadId: reviewThread.id,
          reviewerId: interaction.user.id
        });

        await reviewThread.send({
          components: buildStatusContainerComponents(
            'Submission Denied',
            [
              'The submission was denied.',
              formatDetailLine('Reviewed by', `<@${interaction.user.id}>`),
              formatDetailLine('Denied at', `<t:${Math.floor(reviewedAtTimestamp / 1_000)}:F>`),
              formatDetailLine('Reason', normalizedDenialReason)
            ],
            'denied'
          ),
          flags: MessageFlags.IsComponentsV2,
          allowedMentions: { parse: [] }
        });

        logArtShowcaseDebug(this.container.logger, 'review.deny.thread-status-sent', {
          reviewThreadId: reviewThread.id,
          reviewerId: interaction.user.id
        });

        await reviewThread.setLocked(true, 'Art Showcase submission reviewed');
        logArtShowcaseDebug(this.container.logger, 'review.deny.thread-locked', {
          reviewThreadId: reviewThread.id,
          reviewerId: interaction.user.id
        });

        await reviewThread.setArchived(true, 'Art Showcase submission reviewed');
        logArtShowcaseDebug(this.container.logger, 'review.deny.thread-archived', {
          reviewThreadId: reviewThread.id,
          reviewerId: interaction.user.id
        });

        logArtShowcaseInfo(this.container.logger, 'review.deny.thread-closed', {
          reviewThreadId: reviewThread.id,
          reviewerId: interaction.user.id
        });
      }

      await notifyMember(this.container.logger, submission, this.container.client, [
        'Your Art Showcase submission was denied.',
        formatDetailLine('Theme', resolveThemeLabel(submission.themeValue)),
        formatDetailLine('Denied at', `<t:${Math.floor(reviewedAtTimestamp / 1_000)}:F>`),
        formatDetailLine('Reason', normalizedDenialReason)
      ], 'denied', interaction.user.id);

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

      logArtShowcaseDebug(this.container.logger, 'review.deny.follow-up.sent', {
        reviewerId: interaction.user.id,
        reviewMessageId: interaction.message.id
      });
    } finally {
      endReviewAction(interaction.message.id);
    }
  }
}

async function getSubmissionFromMessage(
  client: Listener['container']['client'],
  sourceMessage: Message,
  artistId: string,
  themeValue: string
) {
  const images = extractSubmissionImagesFromMessageComponents(sourceMessage.components);
  const description = extractSubmissionDescriptionFromMessageComponents(sourceMessage.components);
  if (images.length === 0) return null;
  if (!description) return null;

  const artist = await client.users.fetch(artistId).catch(() => null);
  const artistIdentity = await fetchArtistIdentity(sourceMessage.guild, artistId);

  return {
    artistId,
    artistName: artistIdentity?.artistName ?? artist?.globalName ?? artist?.username ?? artistId,
    artistUsername: artistIdentity?.artistUsername ?? artist?.username ?? artistId,
    artistServerName: artistIdentity?.artistServerName ?? artist?.globalName ?? artist?.username ?? artistId,
    artistAvatarUrl: artistIdentity?.artistAvatarUrl ?? artist?.displayAvatarURL({ extension: 'png' }) ?? null,
    themeValue,
    description,
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

async function notifyMember(
  logger: Listener['container']['logger'],
  submission: SubmissionDisplayData,
  client: Listener['container']['client'],
  lines: string[],
  state: 'approved' | 'denied' | 'pending',
  actorId?: string
) {
  const user = await client.users.fetch(submission.artistId).catch(() => null);
  if (!user) {
    logArtShowcaseWarn(logger, 'member-notify.user-not-found', { artistId: submission.artistId });
    return;
  }

  logArtShowcaseDebug(logger, 'member-notify.started', {
    actorId,
    artistId: submission.artistId,
    state
  });

  await user.send({
    components: buildSubmitterUpdateComponents(submission, lines, state),
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] }
  }).then(() => {
    logArtShowcaseDebug(logger, 'member-notify.sent', { actorId, artistId: submission.artistId, state });
  }).catch((error) => {
    logArtShowcaseWarn(logger, 'member-notify.failed', { actorId, artistId: submission.artistId, error: getErrorMessage(error), state });
    return null;
  });
}

function fetchReviewThread(sourceMessage: Message) {
  return (sourceMessage.thread ?? null) as AnyThreadChannel | null;
}

function beginReviewAction(reviewMessageId: string) {
  if (activeReviewActions.has(reviewMessageId)) return false;

  activeReviewActions.add(reviewMessageId);
  return true;
}

function endReviewAction(reviewMessageId: string) {
  activeReviewActions.delete(reviewMessageId);
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
