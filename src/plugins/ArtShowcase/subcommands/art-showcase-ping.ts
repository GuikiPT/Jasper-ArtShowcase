import { ApplyOptions } from '@sapphire/decorators';
import { ModuleCommand } from '@kbotdev/plugin-modules';
import { RegisterSubCommand } from '@kaname-png/plugin-subcommands-advanced';
import type { ArtShowcasePlugin } from '../artshowcase-plugin';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageActionRowComponentBuilder, MessageFlags, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, ThumbnailBuilder } from 'discord.js';

@RegisterSubCommand('art-showcase', (builder) =>
  builder.setName('ping').setDescription('Check whether the Art Showcase plugin is active.')
)
@ApplyOptions<ModuleCommand.Options>({
  name: 'art-showcase-ping',
  description: 'Check whether the Art Showcase plugin is active.',
  module: 'ArtShowcasePlugin',
  preconditions: ['ModuleEnabled']
})
export class ArtShowcasePingCommand extends ModuleCommand<ArtShowcasePlugin> {
  public override async chatInputRun(interaction: ModuleCommand.ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const latency = Date.now() - interaction.createdTimestamp;
    const websocketLatency = Math.round(this.container.client.ws.ping);

    const pingComponents = [
      new ContainerBuilder()
        .addSectionComponents(
          new SectionBuilder()
            .setThumbnailAccessory(
              new ThumbnailBuilder().setURL(this.container.client.user?.displayAvatarURL({ extension: 'png' }) || '')
            )
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `# 🏓 Art Showcase Instance Latency`
              )
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `### Discord API Latency\n\`\`\`\n[ ${websocketLatency}ms ]\n\`\`\`\n### Bot Latency\n\`\`\`\n[ ${latency}ms ]\n\`\`\``
          )
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `-# The current latency is originating from the Art Showcase Jasper instance, not the main Jasper instance.`
          )
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addActionRowComponents(
          new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Discord Status Page').setURL('https://discordstatus.com/')
          )
        )

    ];
    await interaction.editReply({ components: pingComponents, flags: MessageFlags.IsComponentsV2 });
  }
}
