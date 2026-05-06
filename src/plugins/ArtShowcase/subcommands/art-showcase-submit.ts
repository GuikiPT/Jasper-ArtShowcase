import { ApplyOptions } from '@sapphire/decorators';
import { ModuleCommand } from '@kbotdev/plugin-modules';
import { RegisterSubCommand } from '@kaname-png/plugin-subcommands-advanced';
import type { ArtShowcasePlugin } from '../artshowcase-plugin';
import {
  ART_SHOWCASE_BLACKLIST_ROLE_IDS,
  ART_SHOWCASE_MINIMUM_SUBMIT_LEVEL_LABEL,
  ART_SHOWCASE_SUBMISSION_COOLDOWN_MINUTES,
  ART_SHOWCASE_REVIEWER_ROLE_IDS,
  ART_SHOWCASE_SUBMISSION_LOG_CHANNEL_ID,
  ART_SHOWCASE_SUBMIT_WHITELIST_ROLE_IDS,
  ART_SHOWCASE_SUBMISSIONS_CHANNEL_ID,
  DESCRIPTION_FIELD_ID,
  DESCRIPTION_MAX_LENGTH,
  IMAGE_FIELD_ID,
  MAX_IMAGE_UPLOADS,
  SUBMIT_MODAL_ID,
  THEME_FIELD_ID,
  THEME_OPTIONS
} from '../constants';
import { getSubmissionCooldownExpiresAt } from '../lib/submission-cooldown';
import { logArtShowcaseDebug, logArtShowcaseInfo, logArtShowcaseWarn } from '../lib/logging';
import { buildStatusContainerComponents } from '../lib/submission-components';
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

    if (interaction.inCachedGuild() && hasBlacklistedRole(interaction.member.roles.cache.map((role) => role.id))) {
      logArtShowcaseWarn(this.container.logger, 'submit.command.blacklisted', {
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

    if (interaction.inCachedGuild() && !hasWhitelistedSubmitRole(interaction.member.roles.cache.map((role) => role.id))) {
      logArtShowcaseWarn(this.container.logger, 'submit.command.whitelist-blocked', {
        minimumSubmitLevel: ART_SHOWCASE_MINIMUM_SUBMIT_LEVEL_LABEL,
        whitelistRoleCount: ART_SHOWCASE_SUBMIT_WHITELIST_ROLE_IDS.length,
        userId: interaction.user.id
      });

      await interaction.reply({
        components: buildStatusContainerComponents(
          'Submission Blocked',
          [`You need at least the ${ART_SHOWCASE_MINIMUM_SUBMIT_LEVEL_LABEL} role to submit artwork to Art Showcase.`],
          'denied'
        ),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] }
      });
      return;
    }

    const cooldownExpiresAt = getSubmissionCooldownExpiresAt(interaction.user.id);
    if (cooldownExpiresAt) {
      logArtShowcaseWarn(this.container.logger, 'submit.command.cooldown-active', {
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

function hasBlacklistedRole(memberRoleIds: readonly string[]) {
  return ART_SHOWCASE_BLACKLIST_ROLE_IDS.some((roleId) => memberRoleIds.includes(roleId));
}

function hasWhitelistedSubmitRole(memberRoleIds: readonly string[]) {
  return ART_SHOWCASE_SUBMIT_WHITELIST_ROLE_IDS.some((roleId) => memberRoleIds.includes(roleId));
}
