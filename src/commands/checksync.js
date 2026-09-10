const { ChannelType, EmbedBuilder, MessageFlags } = require('discord.js');
const { assertCanCheckPermissionSync } = require('../services/permissionService');
const logger = require('../utils/logger');

const MAX_EMBED_DESCRIPTION_LENGTH = 3900;

function normalizeOverwrite(overwrite) {
  return {
    id: overwrite.id,
    type: String(overwrite.type),
    allow: String(overwrite.allow?.bitfield ?? overwrite.allow ?? 0),
    deny: String(overwrite.deny?.bitfield ?? overwrite.deny ?? 0),
  };
}

function overwriteKey(overwrite) {
  return `${overwrite.type}:${overwrite.id}`;
}

function overwritesByTarget(overwrites) {
  const entries = overwrites?.cache ? overwrites.cache.values() : overwrites?.values?.() || [];
  return new Map([...entries].map((overwrite) => {
    const normalized = normalizeOverwrite(overwrite);
    return [overwriteKey(normalized), normalized];
  }));
}

function differentOverwriteTargets(categoryOverwrites, channelOverwrites) {
  const category = overwritesByTarget(categoryOverwrites);
  const channel = overwritesByTarget(channelOverwrites);
  const keys = new Set([...category.keys(), ...channel.keys()]);

  return [...keys]
    .filter((key) => {
      const expected = category.get(key);
      const actual = channel.get(key);
      return !expected || !actual || expected.allow !== actual.allow || expected.deny !== actual.deny;
    })
    .map((key) => channel.get(key) || category.get(key));
}

function displayOverwriteTarget(guild, overwrite) {
  if (overwrite.type === '0') {
    if (overwrite.id === guild.id) return '@everyone';
    return guild.roles.cache.get(overwrite.id)?.name || `Role ${overwrite.id}`;
  }
  return guild.members.cache.get(overwrite.id)?.user?.tag || `User ${overwrite.id}`;
}

function formatCategory(category, channels, guild) {
  const lines = [`📁 ${category.name}`];
  if (!channels.length) return { lines: [...lines, '   No channels'], synced: 0, notSynced: 0 };

  let synced = 0;
  let notSynced = 0;
  for (const channel of channels) {
    const differentTargets = differentOverwriteTargets(category.permissionOverwrites, channel.permissionOverwrites);
    if (!differentTargets.length) {
      synced += 1;
      lines.push(`   🟢 #${channel.name} — SYNCED`);
      continue;
    }
    notSynced += 1;
    const targets = differentTargets.map((overwrite) => displayOverwriteTarget(guild, overwrite)).join(', ');
    lines.push(`   🔴 #${channel.name} — NOT SYNCED`);
    lines.push(`      Different: ${targets}`);
  }
  return { lines, synced, notSynced };
}

function splitLinesIntoDescriptions(lines, maximumLength = MAX_EMBED_DESCRIPTION_LENGTH) {
  const descriptions = [];
  let description = '';
  for (const line of lines) {
    if (line.length > maximumLength) {
      if (description) descriptions.push(description);
      for (let start = 0; start < line.length; start += maximumLength) {
        descriptions.push(line.slice(start, start + maximumLength));
      }
      description = '';
      continue;
    }
    const next = description ? `${description}\n${line}` : line;
    if (description && next.length > maximumLength) {
      descriptions.push(description);
      description = line;
    } else {
      description = next;
    }
  }
  if (description) descriptions.push(description);
  return descriptions;
}

function childrenForCategory(category, channels) {
  const children = new Map(
    channels
      .filter((channel) => (channel.parentId || channel.parent?.id) === category.id && channel.type !== ChannelType.GuildCategory)
      .map((channel) => [channel.id, channel]),
  );
  for (const channel of category.children?.cache?.values?.() || []) {
    if (channel.type !== ChannelType.GuildCategory) children.set(channel.id, channel);
  }
  return [...children.values()].sort((left, right) => left.rawPosition - right.rawPosition);
}

async function execute(interaction) {
  assertCanCheckPermissionSync(interaction);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let channels;
  try {
    const fetchedChannels = await interaction.guild.channels.fetch();
    channels = [...fetchedChannels.values()].filter(Boolean);
  } catch (error) {
    logger.error('Permission sync check could not fetch guild channels', { guildId: interaction.guildId, message: error.message });
    throw new Error('I could not retrieve this server’s channels. Please check my server permissions and try again.');
  }

  const categories = channels
    .filter((channel) => channel.type === ChannelType.GuildCategory)
    .sort((left, right) => left.rawPosition - right.rawPosition);
  const detailLines = [];
  let synced = 0;
  let notSynced = 0;

  for (const category of categories) {
    const children = childrenForCategory(category, channels);
    const result = formatCategory(category, children, interaction.guild);
    detailLines.push(...result.lines, '');
    synced += result.synced;
    notSynced += result.notSynced;
  }

  const summary = new EmbedBuilder()
    .setColor(notSynced ? 0xFEE75C : 0x57F287)
    .setTitle('Permission Sync Check')
    .setDescription([
      `✅ Synced: **${synced}**`,
      `⚠️ Not synced: **${notSynced}**`,
      `📁 Categories checked: **${categories.length}**`,
      '',
      detailLines.length ? 'Detailed results are in the messages below.' : 'No categories were found in this server.',
    ].join('\n'));
  await interaction.editReply({ embeds: [summary], allowedMentions: { parse: [] } });

  const descriptions = splitLinesIntoDescriptions(detailLines);
  for (let index = 0; index < descriptions.length; index += 1) {
    const detail = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(descriptions.length > 1 ? `Permission Sync Details (${index + 1}/${descriptions.length})` : 'Permission Sync Details')
      .setDescription(descriptions[index]);
    await interaction.followUp({ embeds: [detail], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  }
}

module.exports = {
  execute,
  normalizeOverwrite,
  differentOverwriteTargets,
  formatCategory,
  childrenForCategory,
  splitLinesIntoDescriptions,
};
