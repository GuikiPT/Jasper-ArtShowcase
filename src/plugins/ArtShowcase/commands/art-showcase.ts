import { ApplyOptions } from '@sapphire/decorators';
import { ApplicationCommandRegistry } from '@sapphire/framework';
import { ModuleSubcommand } from '@kbotdev/plugin-modules';
import { RegisterSubcommandsHooks } from '@kaname-png/plugin-subcommands-advanced';
import type { ArtShowcasePlugin } from '../artshowcase-plugin';

@ApplyOptions<ModuleSubcommand.Options>({
  name: 'art-showcase',
  description: 'Art Showcase plugin commands.',
  module: 'ArtShowcasePlugin',
  preconditions: ['ModuleEnabled']
})
export class ArtShowcaseCommand extends ModuleSubcommand<ArtShowcasePlugin> {
  public override registerApplicationCommands(registry: ApplicationCommandRegistry) {
    registry.registerChatInputCommand((builder) => {
      RegisterSubcommandsHooks.subcommands(this, builder);

      return builder.setName(this.name).setDescription('Art Showcase plugin commands.');
    });
  }
}
