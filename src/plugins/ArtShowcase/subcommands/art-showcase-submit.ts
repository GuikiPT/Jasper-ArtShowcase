import { ApplyOptions } from '@sapphire/decorators';
import { ModuleCommand } from '@kbotdev/plugin-modules';
import { RegisterSubCommand } from '@kaname-png/plugin-subcommands-advanced';
import type { ArtShowcasePlugin } from '../artshowcase-plugin';
import {
  ART_SHOWCASE_REVIEWER_ROLE_IDS,
  ART_SHOWCASE_SUBMISSION_LOG_CHANNEL_ID,
  ART_SHOWCASE_SUBMISSIONS_CHANNEL_ID,
  DESCRIPTION_FIELD_ID,
  DESCRIPTION_MAX_LENGTH,
  IMAGE_FIELD_ID,
  MAX_IMAGE_UPLOADS,
  SUBMIT_MODAL_ID,
  THEME_FIELD_ID,
  THEME_OPTIONS
} from '../constants';
import { logArtShowcaseDebug, logArtShowcaseInfo, logArtShowcaseWarn } from '../lib/logging';
import { FileUploadBuilder, LabelBuilder, MessageFlags, ModalBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';

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
      .setMaxLength(DESCRIPTION_MAX_LENGTH)
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
  }
}
