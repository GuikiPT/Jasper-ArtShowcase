import { ApplyOptions } from '@sapphire/decorators';
import { ModuleCommand } from '@kbotdev/plugin-modules';
import { RegisterSubCommand } from '@kaname-png/plugin-subcommands-advanced';
import type { ArtShowcasePlugin } from '../artshowcase-plugin';
import {
  ART_SHOWCASE_REVIEWER_ROLE_IDS,
  ART_SHOWCASE_SUBMISSION_LOG_CHANNEL_ID,
  ART_SHOWCASE_SUBMISSIONS_CHANNEL_ID,
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
  buildUserReceiptComponents,
  type SubmissionDisplayData
} from '../lib/submission-components';
import { FileUploadBuilder, LabelBuilder, MessageFlags, ModalBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, TextDisplayBuilder, ThreadAutoArchiveDuration, type SendableChannels } from 'discord.js';

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
    if (
      !ART_SHOWCASE_SUBMISSION_LOG_CHANNEL_ID ||
      !ART_SHOWCASE_SUBMISSIONS_CHANNEL_ID ||
      ART_SHOWCASE_REVIEWER_ROLE_IDS.length === 0
    ) {
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
          .setLabel('Artwork Images')
          .setDescription(`Upload between 1 and ${MAX_IMAGE_UPLOADS} image files for this submission.`)
          .setFileUploadComponent(imageUpload)
      );

    await interaction.showModal(modal);

    let modalSubmission: Awaited<ReturnType<ModuleCommand.ChatInputCommandInteraction['awaitModalSubmit']>> | null = null;

    try {
      const submission = await interaction.awaitModalSubmit({
        filter: (modalInteraction) =>
          modalInteraction.customId === modalCustomId && modalInteraction.user.id === interaction.user.id,
        time: 300_000
      });

      modalSubmission = submission;

      await submission.deferReply({
        flags: MessageFlags.Ephemeral
      });

      const selectedThemeValue = submission.fields.getStringSelectValues(THEME_FIELD_ID)[0];
      const selectedTheme = THEME_OPTIONS.find((theme) => theme.value === selectedThemeValue);
      const uploadedFiles = [...submission.fields.getUploadedFiles(IMAGE_FIELD_ID, true).values()];

      if (!selectedTheme || uploadedFiles.length === 0) {
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
        await submission.editReply({
          components: buildStatusContainerComponents(
            'Submission Failed',
            [
              'Only image uploads are allowed. Please remove the non-image files and try again.',
              ...invalidFiles.map((file) => `- ${file.name}`)
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

      const submissionData: SubmissionDisplayData = {
        artistId: submission.user.id,
        artistName: submission.user.username,
        artistAvatarUrl: submission.user.displayAvatarURL({ extension: 'png' }),
        themeValue: selectedTheme.value,
        images: uploadedFiles.map((file) => ({ name: file.name, url: file.url })),
        submittedAtTimestamp: submission.createdTimestamp
      };

      const reviewMessage = await reviewLogChannel.send({
        components: buildReviewMessageComponents(submissionData, { state: 'pending' }),
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] }
      });

      await reviewMessage.react('✅');
      await reviewMessage.react('❌');

      const reviewThread = await reviewMessage.startThread({
        name: buildReviewThreadName('pending', submission.user.username, selectedTheme.value),
        autoArchiveDuration: ThreadAutoArchiveDuration.OneDay
      });

      const reviewerMentions = ART_SHOWCASE_REVIEWER_ROLE_IDS.map((roleId) => `<@&${roleId}>`).join(' ');
      if (reviewerMentions) {
        await reviewThread.send({
          content: reviewerMentions,
          allowedMentions: {
            parse: [],
            roles: ART_SHOWCASE_REVIEWER_ROLE_IDS
          }
        });
      }

      await submission.user.send({
        components: buildStatusContainerComponents(
          'Art Showcase Update',
          [
            'Your Art Showcase submission is now waiting for staff review.',
            `Theme: ${selectedTheme.label}`,
            `Images submitted: ${submissionData.images.length}`
          ],
          'pending'
        ),
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] }
      }).catch(() => null);

      await submission.editReply({
        components: buildUserReceiptComponents(submissionData),
        flags: MessageFlags.IsComponentsV2
      });
    } catch (error) {
      if (!(error instanceof Error) || !/time/i.test(error.message)) {
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
