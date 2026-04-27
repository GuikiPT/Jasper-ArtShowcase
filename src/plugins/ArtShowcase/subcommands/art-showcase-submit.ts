import { ApplyOptions } from '@sapphire/decorators';
import { ModuleCommand } from '@kbotdev/plugin-modules';
import { RegisterSubCommand } from '@kaname-png/plugin-subcommands-advanced';
import type { ArtShowcasePlugin } from '../artshowcase-plugin';
import {
  ART_SHOWCASE_REVIEWER_ROLE_IDS,
  ART_SHOWCASE_SUBMISSION_LOG_CHANNEL_ID,
  ART_SHOWCASE_SUBMISSIONS_CHANNEL_ID,
  DESCRIPTION_FIELD_ID,
  IMAGE_FIELD_ID,
  MAX_IMAGE_UPLOADS,
  SUBMIT_MODAL_ID,
  THEME_FIELD_ID,
  THEME_OPTIONS
} from '../constants';
import {
  buildReviewThreadName,
  buildReviewMessageComponents,
  buildStatusContainerComponents,
  buildSubmitterUpdateComponents,
  buildUserReceiptComponents,
  formatDetailLine,
  type SubmissionDisplayData
} from '../lib/submission-components';
import {
  getErrorMessage,
  logArtShowcaseDebug,
  logArtShowcaseError,
  logArtShowcaseInfo,
  logArtShowcaseWarn
} from '../lib/logging';
import { FileUploadBuilder, LabelBuilder, MessageFlags, ModalBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle, ThreadAutoArchiveDuration, type SendableChannels } from 'discord.js';

@RegisterSubCommand('art-showcase', (builder) =>
  builder.setName('submit').setDescription('Open the art submission modal.')
)
@ApplyOptions<ModuleCommand.Options>({
  name: 'art-showcase-submit',
  description: 'Open the art submission modal.',
  module: 'ArtShowcasePlugin',
  preconditions: ['ModuleEnabled']
})
export class ArtShowcaseSubmitCommand extends ModuleCommand<ArtShowcasePlugin> {
  public override async chatInputRun(interaction: ModuleCommand.ChatInputCommandInteraction) {
    logArtShowcaseInfo(this.container.logger, 'submit.command.received', {
      channelId: interaction.channelId,
      guildId: interaction.guildId,
      userId: interaction.user.id
    });

    if (
      !ART_SHOWCASE_SUBMISSION_LOG_CHANNEL_ID ||
      !ART_SHOWCASE_SUBMISSIONS_CHANNEL_ID ||
      ART_SHOWCASE_REVIEWER_ROLE_IDS.length === 0
    ) {
      logArtShowcaseWarn(this.container.logger, 'submit.command.not-configured', {
        hasLogChannel: Boolean(ART_SHOWCASE_SUBMISSION_LOG_CHANNEL_ID),
        hasReviewerRoles: ART_SHOWCASE_REVIEWER_ROLE_IDS.length > 0,
        hasSubmissionChannel: Boolean(ART_SHOWCASE_SUBMISSIONS_CHANNEL_ID),
        userId: interaction.user.id
      });

      await interaction.reply({
        content: 'Art Showcase submission channels or reviewer roles are not configured yet.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const modalCustomId = `${SUBMIT_MODAL_ID}:${interaction.id}`;

    const modal = new ModalBuilder().setCustomId(modalCustomId).setTitle('Art Showcase Submission');

    const themeSelect = new StringSelectMenuBuilder()
      .setCustomId(THEME_FIELD_ID)
      .setPlaceholder('Choose a theme')
      .setRequired(true)
      .addOptions(
        THEME_OPTIONS.map((theme) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(theme.label)
            .setValue(theme.value)
            .setDescription(theme.description)
        )
      );

    const imageUpload = new FileUploadBuilder()
      .setCustomId(IMAGE_FIELD_ID)
      .setRequired(true)
      .setMinValues(1)
      .setMaxValues(MAX_IMAGE_UPLOADS);

    const descriptionInput = new TextInputBuilder()
      .setCustomId(DESCRIPTION_FIELD_ID)
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(1_000)
      .setPlaceholder('Describe your art, idea, inspiration, or process.');

    modal
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `Upload up to ${MAX_IMAGE_UPLOADS} images and select the theme that best matches your submission.`
        )
      )
      .addLabelComponents(
        new LabelBuilder()
          .setLabel('Theme')
          .setDescription('Choose one of the approved showcase themes.')
          .setStringSelectMenuComponent(themeSelect),
        new LabelBuilder()
          .setLabel('Describe Your Art')
          .setDescription('Tell staff what your piece is about or what inspired it.')
          .setTextInputComponent(descriptionInput),
        new LabelBuilder()
          .setLabel('Artwork Images')
          .setDescription(`Upload between 1 and ${MAX_IMAGE_UPLOADS} image files for this submission.`)
          .setFileUploadComponent(imageUpload)
      );

    await interaction.showModal(modal);
    logArtShowcaseDebug(this.container.logger, 'submit.modal.shown', {
      modalCustomId,
      userId: interaction.user.id
    });

    let modalSubmission: Awaited<ReturnType<ModuleCommand.ChatInputCommandInteraction['awaitModalSubmit']>> | null = null;

    try {
      const submission = await interaction.awaitModalSubmit({
        filter: (modalInteraction) =>
          modalInteraction.customId === modalCustomId && modalInteraction.user.id === interaction.user.id,
        time: 300_000
      });

      modalSubmission = submission;

      logArtShowcaseInfo(this.container.logger, 'submit.modal.received', {
        channelId: submission.channelId,
        guildId: submission.guildId,
        userId: submission.user.id
      });

      await submission.deferReply({
        flags: MessageFlags.Ephemeral
      });

      const selectedThemeValue = submission.fields.getStringSelectValues(THEME_FIELD_ID)[0];
      const selectedTheme = THEME_OPTIONS.find((theme) => theme.value === selectedThemeValue);
      const description = submission.fields.getTextInputValue(DESCRIPTION_FIELD_ID).trim();
      const uploadedFiles = [...submission.fields.getUploadedFiles(IMAGE_FIELD_ID, true).values()];

      logArtShowcaseInfo(this.container.logger, 'submit.payload.parsed', {
        descriptionLength: description.length,
        imageCount: uploadedFiles.length,
        themeValue: selectedTheme?.value,
        userId: submission.user.id
      });

      if (!selectedTheme || uploadedFiles.length === 0 || description.length === 0) {
        logArtShowcaseWarn(this.container.logger, 'submit.payload.invalid', {
          descriptionLength: description.length,
          imageCount: uploadedFiles.length,
          themeValue: selectedTheme?.value,
          userId: submission.user.id
        });

        await submission.editReply({
          components: buildStatusContainerComponents(
            'Submission Failed',
            ['The submission could not be processed. Please try again.'],
            'denied'
          ),
          flags: MessageFlags.IsComponentsV2,
          allowedMentions: { parse: [] }
        });
        return;
      }

      const invalidFiles = uploadedFiles.filter((file) => !file.contentType?.startsWith('image/'));

      if (invalidFiles.length > 0) {
        logArtShowcaseWarn(this.container.logger, 'submit.payload.non-image-files', {
          invalidFileCount: invalidFiles.length,
          userId: submission.user.id
        });

        await submission.editReply({
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

      const reviewLogChannel = await fetchSendableChannel(this.container.client, ART_SHOWCASE_SUBMISSION_LOG_CHANNEL_ID);
      if (!reviewLogChannel) {
        logArtShowcaseError(this.container.logger, 'submit.log-channel.invalid', new Error('Review log channel is not sendable.'), {
          channelId: ART_SHOWCASE_SUBMISSION_LOG_CHANNEL_ID,
          userId: submission.user.id
        });

        await submission.editReply({
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

      logArtShowcaseInfo(this.container.logger, 'submit.log-channel.resolved', {
        channelId: reviewLogChannel.id,
        userId: submission.user.id
      });

      const submissionData: SubmissionDisplayData = {
        artistId: submission.user.id,
        artistName: submission.user.username,
        artistAvatarUrl: submission.user.displayAvatarURL({ extension: 'png' }),
        themeValue: selectedTheme.value,
        description,
        images: uploadedFiles.map((file) => ({ name: file.name, url: file.url })),
        submittedAtTimestamp: submission.createdTimestamp
      };

      logArtShowcaseDebug(this.container.logger, 'submit.payload.prepared', {
        descriptionLength: submissionData.description.length,
        imageCount: submissionData.images.length,
        userId: submission.user.id
      });

      const reviewMessage = await reviewLogChannel.send({
        components: buildReviewMessageComponents(submissionData, { state: 'pending' }),
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] }
      });

      logArtShowcaseInfo(this.container.logger, 'submit.review-message.created', {
        imageCount: submissionData.images.length,
        reviewMessageId: reviewMessage.id,
        themeValue: submissionData.themeValue,
        userId: submission.user.id
      });

      await reviewMessage.react('✅');
      await reviewMessage.react('❌');

      logArtShowcaseDebug(this.container.logger, 'submit.review-message.reactions-added', {
        reviewMessageId: reviewMessage.id,
        userId: submission.user.id
      });

      const reviewThread = await reviewMessage.startThread({
        name: buildReviewThreadName('pending', submission.user.username, selectedTheme.value),
        autoArchiveDuration: ThreadAutoArchiveDuration.OneDay
      });

      logArtShowcaseInfo(this.container.logger, 'submit.review-thread.created', {
        reviewThreadId: reviewThread.id,
        reviewMessageId: reviewMessage.id,
        userId: submission.user.id
      });

      const reviewerMentions = ART_SHOWCASE_REVIEWER_ROLE_IDS.map((roleId) => `<@&${roleId}>`).join(' ');
      if (reviewerMentions) {
        logArtShowcaseDebug(this.container.logger, 'submit.review-thread.ping-started', {
          reviewThreadId: reviewThread.id,
          roleCount: ART_SHOWCASE_REVIEWER_ROLE_IDS.length,
          userId: submission.user.id
        });

        await reviewThread.send({
          content: reviewerMentions,
          allowedMentions: {
            parse: [],
            roles: ART_SHOWCASE_REVIEWER_ROLE_IDS
          }
        });

        logArtShowcaseDebug(this.container.logger, 'submit.review-thread.ping-sent', {
          reviewThreadId: reviewThread.id,
          roleCount: ART_SHOWCASE_REVIEWER_ROLE_IDS.length,
          userId: submission.user.id
        });
      }

      logArtShowcaseDebug(this.container.logger, 'submit.waiting-dm.started', {
        reviewThreadId: reviewThread.id,
        userId: submission.user.id
      });

      await submission.user.send({
        components: buildSubmitterUpdateComponents(submissionData, [
          'Your Art Showcase submission has been received.',
          formatDetailLine('Status', 'Waiting for staff review'),
          formatDetailLine('Theme', selectedTheme.label),
          formatDetailLine('Images submitted', submissionData.images.length)
        ], 'pending'),
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] }
      }).then(() => {
        logArtShowcaseDebug(this.container.logger, 'submit.waiting-dm.sent', {
          userId: submission.user.id
        });
      }).catch((error) => {
        logArtShowcaseWarn(this.container.logger, 'submit.waiting-dm.failed', {
          error: getErrorMessage(error),
          userId: submission.user.id
        });
        return null;
      });

      await submission.editReply({
        components: buildUserReceiptComponents(submissionData),
        flags: MessageFlags.IsComponentsV2
      });

      logArtShowcaseDebug(this.container.logger, 'submit.receipt.updated', {
        reviewMessageId: reviewMessage.id,
        userId: submission.user.id
      });

      logArtShowcaseInfo(this.container.logger, 'submit.completed', {
        reviewMessageId: reviewMessage.id,
        reviewThreadId: reviewThread.id,
        userId: submission.user.id
      });
    } catch (error) {
      if (!(error instanceof Error) || !/time/i.test(error.message)) {
        logArtShowcaseError(this.container.logger, 'submit.failed', error, {
          modalSubmissionReceived: Boolean(modalSubmission),
          userId: interaction.user.id
        });

        const failurePayload = {
          components: buildStatusContainerComponents(
            'Submission Failed',
            ['The submission could not be fully processed. Please try again or contact staff if this keeps happening.'],
            'denied'
          ),
          flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
          allowedMentions: { parse: [] }
        } as const;

        if (modalSubmission?.deferred || modalSubmission?.replied) {
          await modalSubmission.editReply({
            components: failurePayload.components,
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: failurePayload.allowedMentions
          }).catch(() => null);
        } else {
          await interaction.followUp(failurePayload).catch(() => null);
        }

        return;
      }

      logArtShowcaseWarn(this.container.logger, 'submit.modal.timed-out', {
        userId: interaction.user.id
      });

      await interaction.followUp({
        components: buildStatusContainerComponents(
          'Submission Timed Out',
          ['The submission modal expired before it was sent. Run the command again when you are ready.'],
          'denied'
        ),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] }
      });
    }
  }
}

async function fetchSendableChannel(client: ModuleCommand<ArtShowcasePlugin>['container']['client'], channelId: string) {
  const channel = await client.channels.fetch(channelId).catch(() => null);

  if (!channel || !channel.isTextBased() || !('send' in channel)) return null;

  return channel as SendableChannels;
}
