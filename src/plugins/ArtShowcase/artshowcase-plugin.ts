import { Module, type IsEnabledContext } from '@kbotdev/plugin-modules';
import type { Piece, SapphireClient } from '@sapphire/framework';
import { join } from 'path';

export class ArtShowcasePlugin extends Module {
  public constructor(context: Module.LoaderContext, options: Piece.Options) {
    super(context, {
      ...options,
      name: 'ArtShowcasePlugin',
      fullName: 'Art Showcase',
      description: 'Art Showcase plugin commands, subcommands, and listeners.'
    });
  }

  public override isEnabled(_context: IsEnabledContext) {
    return true;
  }
}

export function registerArtShowcasePlugin(client: SapphireClient) {
  void client.stores.loadPiece({
    name: 'ArtShowcasePlugin',
    piece: ArtShowcasePlugin,
    store: 'modules'
  });

  client.stores.get('commands').registerPath(join(__dirname, 'commands'));
  client.stores.get('commands').registerPath(join(__dirname, 'subcommands'));
  client.stores.get('listeners').registerPath(join(__dirname, 'listeners'));
}

declare module '@kbotdev/plugin-modules' {
  interface Modules {
    ArtShowcasePlugin: never;
  }
}
