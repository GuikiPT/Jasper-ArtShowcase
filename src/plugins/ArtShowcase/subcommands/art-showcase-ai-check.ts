import { ApplyOptions } from '@sapphire/decorators';
import { ModuleCommand } from '@kbotdev/plugin-modules';
import { RegisterSubCommand } from '@kaname-png/plugin-subcommands-advanced';
import type { ArtShowcasePlugin } from '../artshowcase-plugin';
import {
  ART_SHOWCASE_REVIEWER_ROLE_IDS,
  ART_SHOWCASE_SUBMISSION_LOG_CHANNEL_ID
} from '../constants';
import {
  buildStatusContainerComponents,
  extractReviewActionMetadataFromMessageComponents,
  extractSubmissionDescriptionFromMessageComponents,
  extractSubmissionImagesFromMessageComponents,
  formatDetailLine,
  resolveThemeOption,
  type ReviewActionMetadata,
  type SubmissionDisplayData
} from '../lib/submission-components';
import {
  detectAiGeneratedImage,
  formatGeneratorName,
  isSightengineConfigured,
  summarizeAiGeneratedScore
} from '../lib/sightengine';
import {
  getErrorMessage,
  logArtShowcaseDebug,
  logArtShowcaseInfo,
  logArtShowcaseWarn
} from '../lib/logging';
import {
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  Message,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  type ChatInputCommandInteraction,
  type ThreadChannel
} from 'discord.js';

@RegisterSubCommand('art-showcase', (builder) =>
  builder.setName('ai-check').setDescription('Run AI detection for the current Art Showcase review thread.')
)
@ApplyOptions<ModuleCommand.Options>({
  name: 'art-showcase-ai-check',
  description: 'Run AI detection for the current Art Showcase review thread.',
  module: 'ArtShowcasePlugin',
  preconditions: ['ModuleEnabled']
})
export class ArtShowcaseAiCheckCommand extends ModuleCommand<ArtShowcasePlugin> {
  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    logArtShowcaseInfo(this.container.logger, 'ai-check.command.received', {
      channelId: interaction.channelId,
      guildId: interaction.guildId,
      userId: interaction.user.id
    });

    if (!interaction.inCachedGuild()) {
      logArtShowcaseWarn(this.container.logger, 'ai-check.unavailable.outside-guild', {
        userId: interaction.user.id
      });
      await interaction.reply({
        components: buildStatusContainerComponents(
          'Unavailable',
          ['This command can only be used inside the server.'],
          'denied'
        ),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] }
      });
      return;
    }

    if (!isSightengineConfigured()) {
      logArtShowcaseWarn(this.container.logger, 'ai-check.unavailable.not-configured', {
        userId: interaction.user.id
      });
      await interaction.reply({
        components: buildStatusContainerComponents(
          'Unavailable',
          ['Sightengine credentials are not configured.'],
          'denied'
        ),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] }
      });
      return;
    }

    if (ART_SHOWCASE_REVIEWER_ROLE_IDS.length === 0 || !ART_SHOWCASE_REVIEWER_ROLE_IDS.some((roleId) => interaction.member.roles.cache.has(roleId))) {
      logArtShowcaseWarn(this.container.logger, 'ai-check.permission-denied', {
        userId: interaction.user.id,
        threadId: interaction.channelId
      });
      await interaction.reply({
        components: buildStatusContainerComponents(
          'Permission Denied',
          ['You do not have permission to run AI checks for Art Showcase submissions.'],
          'denied'
        ),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] }
      });
      return;
    }

    const thread = interaction.channel;
    if (!thread?.isThread() || thread.parentId !== ART_SHOWCASE_SUBMISSION_LOG_CHANNEL_ID) {
      logArtShowcaseWarn(this.container.logger, 'ai-check.wrong-channel', {
        channelId: interaction.channelId,
        userId: interaction.user.id
      });
      await interaction.reply({
        components: buildStatusContainerComponents(
          'Wrong Channel',
          ['Run this command inside a submission review thread in the staff log channel.'],
          'denied'
        ),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] }
      });
      return;
    }

    await interaction.deferReply();
    logArtShowcaseInfo(this.container.logger, 'ai-check.started', {
      threadId: thread.id,
      userId: interaction.user.id
    });

    const reviewMessage = await fetchReviewStarterMessage(thread);
    if (!reviewMessage) {
      logArtShowcaseWarn(this.container.logger, 'ai-check.review-message.missing', {
        threadId: thread.id,
        userId: interaction.user.id
      });
      await interaction.editReply({
        components: buildStatusContainerComponents(
          'Review Missing',
          ['The submission review message could not be found for this thread.'],
          'denied'
        ),
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] }
      });
      return;
    }

    const submissionData = await getSubmissionFromReviewMessage(this.container.client, reviewMessage);
    if (!submissionData) {
      logArtShowcaseWarn(this.container.logger, 'ai-check.submission-data.missing', {
        reviewMessageId: reviewMessage.id,
        threadId: thread.id,
        userId: interaction.user.id
      });
      await interaction.editReply({
        components: buildStatusContainerComponents(
          'Submission Missing',
          ['The submission data could not be recovered from the review message.'],
          'denied'
        ),
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] }
      });
      return;
    }

    const aiDetections = await Promise.allSettled(
      submissionData.images.map(async (image) => ({
        image,
        detection: await detectAiGeneratedImage(image.url)
      }))
    );

    logArtShowcaseInfo(this.container.logger, 'ai-check.results.received', {
      imageCount: submissionData.images.length,
      threadId: thread.id,
      userId: interaction.user.id
    });

    await thread.send({
      components: buildAiDetectionOverviewComponents(submissionData, interaction.user.id),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] }
    });

    logArtShowcaseDebug(this.container.logger, 'ai-check.overview-posted', {
      threadId: thread.id,
      userId: interaction.user.id
    });

    for (const [index, result] of aiDetections.entries()) {
      if (result.status === 'rejected') {
        logArtShowcaseWarn(this.container.logger, 'ai-check.image.failed', {
          error: getErrorMessage(result.reason),
          imageIndex: index + 1,
          threadId: thread.id,
          userId: interaction.user.id
        });
      } else {
        logArtShowcaseDebug(this.container.logger, 'ai-check.image.completed', {
          imageIndex: index + 1,
          score: Math.round(result.value.detection.aiGeneratedScore * 100),
          threadId: thread.id,
          userId: interaction.user.id
        });
      }

      await thread.send({
        components: buildAiDetectionResultComponents(submissionData.images[index], result, index),
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] }
      });
    }

    await interaction.editReply({
      components: buildStatusContainerComponents(
        'AI Check Complete',
        [`AI check executed by <@${interaction.user.id}>.`, 'Sightengine results were posted in this review thread.'],
        'approved'
      ),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] }
    });

    logArtShowcaseInfo(this.container.logger, 'ai-check.completed', {
      imageCount: submissionData.images.length,
      threadId: thread.id,
      userId: interaction.user.id
    });
  }
}

async function fetchReviewStarterMessage(thread: ThreadChannel) {
  const parent = thread.parent;

  if (!parent || !parent.isTextBased() || !('messages' in parent)) return null;

  return (await parent.messages.fetch(thread.id).catch(() => null)) as Message | null;
}

async function getSubmissionFromReviewMessage(
  client: ModuleCommand<ArtShowcasePlugin>['container']['client'],
  reviewMessage: Message
) {
  const reviewAction: ReviewActionMetadata | null = extractReviewActionMetadataFromMessageComponents(reviewMessage.components);
  const description = extractSubmissionDescriptionFromMessageComponents(reviewMessage.components);
  const images = extractSubmissionImagesFromMessageComponents(reviewMessage.components);

  if (!reviewAction || !description || images.length === 0) return null;

  const artist = await client.users.fetch(reviewAction.artistId).catch(() => null);
  const theme = resolveThemeOption(reviewAction.themeValue);

  return {
    artistId: reviewAction.artistId,
    artistName: artist?.username ?? reviewAction.artistId,
    artistAvatarUrl: artist?.displayAvatarURL({ extension: 'png' }) ?? null,
    themeValue: theme?.value ?? reviewAction.themeValue,
    description,
    images,
    submittedAtTimestamp: reviewMessage.createdTimestamp
  } satisfies SubmissionDisplayData;
}

function buildAiDetectionOverviewComponents(
  submissionData: SubmissionDisplayData,
  executorId: string,
) {
  const theme = resolveThemeOption(submissionData.themeValue);

  return [
    new ContainerBuilder()
      .setAccentColor(0xf1c40f)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            '# AI Detection Advisory',
            'Using Sightengine GenAI reverse lookup.',
            formatDetailLine('Executed by', `<@${executorId}>`),
            formatDetailLine('Artist', `<@${submissionData.artistId}>`),
            formatDetailLine('Theme', theme?.label ?? submissionData.themeValue),
            formatDetailLine('Images checked', submissionData.images.length),
            'Treat these scores as a signal, not an automatic verdict.'
          ].join('\n')
        )
      )
  ];
}

function buildAiDetectionResultComponents(
  image: SubmissionDisplayData['images'][number],
  result: PromiseSettledResult<{
    image: SubmissionDisplayData['images'][number];
    detection: Awaited<ReturnType<typeof detectAiGeneratedImage>>;
  }>,
  index: number,
) {
  const container = new ContainerBuilder()
    .setAccentColor(0xf1c40f)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Image ${index + 1}`))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true))
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(image.url).setDescription(image.name)
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true));

  if (result.status === 'rejected') {
    return [
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            formatDetailLine('Status', 'Check failed'),
            formatDetailLine('Error', result.reason instanceof Error ? result.reason.message : 'Unknown error')
          ].join('\n')
        )
      )
    ];
  }

  const percent = Math.round(result.value.detection.aiGeneratedScore * 100);
  const topGenerator = Object.entries(result.value.detection.generators).sort((left, right) => right[1] - left[1])[0];
  const lines = [
    formatDetailLine('AI likelihood', `${summarizeAiGeneratedScore(result.value.detection.aiGeneratedScore)} (${percent}%)`)
  ];

  if (topGenerator && topGenerator[1] > 0) {
    lines.push(formatDetailLine('Top generator', `${formatGeneratorName(topGenerator[0])} (${Math.round(topGenerator[1] * 100)}%)`));
  }

  return [container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))];
}
