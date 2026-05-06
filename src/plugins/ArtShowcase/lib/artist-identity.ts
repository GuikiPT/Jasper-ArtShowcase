import type { Guild, GuildMember, User } from 'discord.js';

type ArtistIdentity = {
  artistId: string;
  artistName: string;
  artistUsername: string;
  artistServerName: string;
  artistAvatarUrl: string | null;
};

export function createArtistIdentity(user: User, member?: GuildMember | null): ArtistIdentity {
  const artistUsername = user.username;
  const artistServerName = member?.displayName ?? user.globalName ?? artistUsername;

  return {
    artistId: user.id,
    artistName: artistServerName,
    artistUsername,
    artistServerName,
    artistAvatarUrl: member?.displayAvatarURL({ extension: 'png' }) ?? user.displayAvatarURL({ extension: 'png' })
  };
}

export async function fetchArtistIdentity(guild: Guild | null, artistId: string): Promise<ArtistIdentity | null> {
  const user = await guild?.client.users.fetch(artistId).catch(() => null);
  if (!user) return null;

  const member = guild ? await guild.members.fetch(artistId).catch(() => null) : null;
  return createArtistIdentity(user, member);
}
