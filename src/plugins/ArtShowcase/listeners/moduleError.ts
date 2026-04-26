import { Listener } from '@sapphire/framework';
import type { Module } from '@kbotdev/plugin-modules';

export class UserEvent extends Listener<'moduleError'> {
  public override run(error: unknown, module: Module) {
    if (module.name !== 'ArtShowcasePlugin') return;

    this.container.logger.error(error);
  }
}
