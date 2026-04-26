import { Listener, Events, type ChatInputCommandErrorPayload } from '@sapphire/framework';
import { MessageFlags } from 'discord.js';

export class UserListener extends Listener<typeof Events.ChatInputCommandError> {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.ChatInputCommandError });
  }

  public override async run(error: unknown, payload: ChatInputCommandErrorPayload) {
    const { interaction, command } = payload;

    this.container.logger.error(
      `[ChatInputError] command=${command.name} user=${interaction.user.id} guild=${interaction.guildId ?? 'dm'} channel=${interaction.channelId}`,
      error
    );

    const content = 'An unexpected error occurred while running this command. The incident was logged.';

    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply({ content, allowedMentions: { parse: [] } }).catch(() => null);
      return;
    }

    if (interaction.replied) {
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }).catch(() => null);
      return;
    }

    await interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }).catch(() => null);
  }
}
