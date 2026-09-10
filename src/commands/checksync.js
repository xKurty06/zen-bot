const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder,
  MessageFlags, PermissionsBitField, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} = require('discord.js');
const { assertCanCheckPermissionSync } = require('../services/permissionService');
const logger = require('../utils/logger');

const MAX_CATEGORIES_PER_PAGE = 25;
const MAX_CHANNELS_PER_PAGE = 12;
const SELECT_PREFIX = 'checksync:category:';
const PAGE_PREFIX = 'checksync:page:';
const CATEGORY_SYNCED = '<:green_tick:1547706115989442621>';
const CATEGORY_NOT_SYNCED = '<:red_tick:1547706186386645012>';
const PERMISSION_ALLOW = '<:bb_dot3:1547710157524303995>';
const PERMISSION_DENY = '<:bb_dot1:1547710117732950086>';
const PERMISSION_NOT_SET = '<:bb_dot2:1547710239648911371>';

function normalizeOverwrite(overwrite) {
  return { id: overwrite.id, type: String(overwrite.type), allow: BigInt(overwrite.allow?.bitfield ?? overwrite.allow ?? 0), deny: BigInt(overwrite.deny?.bitfield ?? overwrite.deny ?? 0) };
}
function overwriteKey(overwrite) { return `${overwrite.type}:${overwrite.id}`; }
function overwritesByTarget(overwrites) {
  const entries = overwrites?.cache ? overwrites.cache.values() : overwrites?.values?.() || [];
  return new Map([...entries].map((overwrite) => { const normalized = normalizeOverwrite(overwrite); return [overwriteKey(normalized), normalized]; }));
}
function differentOverwriteTargets(categoryOverwrites, channelOverwrites) {
  const category = overwritesByTarget(categoryOverwrites);
  const channel = overwritesByTarget(channelOverwrites);
  return [...new Set([...category.keys(), ...channel.keys()])]
    .filter((key) => { const expected = category.get(key); const actual = channel.get(key); return !expected || !actual || expected.allow !== actual.allow || expected.deny !== actual.deny; })
    .map((key) => channel.get(key) || category.get(key));
}
function displayOverwriteTarget(guild, overwrite) {
  if (!overwrite) return '@unknown';
  if (overwrite.type === '0') {
    const role = guild?.roles?.cache?.get(overwrite.id);
    if (overwrite.id === guild?.id || role?.name === '@everyone') return '@everyone';
    return `@${role?.name || overwrite.id}`;
  }
  const member = guild?.members?.cache?.get(overwrite.id);
  return `@${member?.user?.username || member?.displayName || overwrite.id}`;
}
function formatCategoryTitle(name) {
  return `📁 Category: 「 ${String(name || 'UNKNOWN').trim().toUpperCase()} 」`;
}
function permissionName(name) { return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2'); }
function permissionState(overwrite, permission) {
  if (!overwrite) return 'Not Set';
  if ((overwrite.allow & permission) === permission) return 'Allow';
  if ((overwrite.deny & permission) === permission) return 'Deny';
  return 'Not Set';
}
function permissionStateIcon(state) {
  if (state === 'Allow') return PERMISSION_ALLOW;
  if (state === 'Deny') return PERMISSION_DENY;
  return PERMISSION_NOT_SET;
}
function differentPermissions(categoryOverwrite, channelOverwrite) {
  const unique = new Map();
  for (const [name, value] of Object.entries(PermissionsBitField.Flags)) unique.set(BigInt(value).toString(), { name, value: BigInt(value) });
  return [...unique.values()]
    .map(({ name, value }) => ({ name: permissionName(name), category: permissionState(categoryOverwrite, value), channel: permissionState(channelOverwrite, value) }))
    .filter((permission) => permission.category !== permission.channel);
}
function overwriteDifferences(category, channel, guild) {
  const categoryByTarget = overwritesByTarget(category.permissionOverwrites);
  const channelByTarget = overwritesByTarget(channel.permissionOverwrites);
  return [...new Set([...categoryByTarget.keys(), ...channelByTarget.keys()])]
    .map((key) => {
      const categoryOverwrite = categoryByTarget.get(key);
      const channelOverwrite = channelByTarget.get(key);
      return { target: displayOverwriteTarget(guild, channelOverwrite || categoryOverwrite), permissions: differentPermissions(categoryOverwrite, channelOverwrite) };
    })
    .filter((difference) => difference.permissions.length);
}
function formatChannel(channel, differences) {
  if (!differences.length) return `${CATEGORY_SYNCED} #${channel.name} — SYNCED`;
  const lines = [`\n${CATEGORY_NOT_SYNCED} #${channel.name} — NOT SYNCED`, ''];
  for (const difference of differences) {
    lines.push(difference.target);
    for (const permission of difference.permissions) {
      lines.push(`• ${permission.name}: Category ${permissionStateIcon(permission.category)} | Channel ${permissionStateIcon(permission.channel)}`);
    }
  }
  return lines.join('\n').trimEnd();
}
function formatCategory(category, channels, guild) {
  const lines = [formatCategoryTitle(category.name)];
  if (!channels.length) return { lines: [...lines, '', 'No channels in this category.'], synced: 0, notSynced: 0 };
  let synced = 0; let notSynced = 0;
  let chindex = 0;
  for (const [index, channel] of channels.entries()) {
    const differences = overwriteDifferences(category, channel, guild);
    if (differences.length) notSynced += 1; else synced += 1;
    if (index === 0) lines.push('');
    lines.push(formatChannel(channel, differences));
    chindex = 1;
    if (index < channels.length - 1) { lines.push('') ;if (differences.length); }
  }
  return { lines, synced, notSynced };
}
function splitLinesIntoDescriptions(lines, maximumLength = 3900) {
  const descriptions = []; let description = '';
  for (const line of lines) {
    if (line.length > maximumLength) { if (description) descriptions.push(description); for (let start = 0; start < line.length; start += maximumLength) descriptions.push(line.slice(start, start + maximumLength)); description = ''; continue; }
    const next = description ? `${description}\n${line}` : line;
    if (description && next.length > maximumLength) { descriptions.push(description); description = line; } else description = next;
  }
  if (description) descriptions.push(description);
  return descriptions;
}
function childrenForCategory(category, channels) {
  const children = new Map(channels.filter((channel) => (channel.parentId || channel.parent?.id) === category.id && channel.type !== ChannelType.GuildCategory).map((channel) => [channel.id, channel]));
  for (const channel of category.children?.cache?.values?.() || []) if (channel.type !== ChannelType.GuildCategory) children.set(channel.id, channel);
  return [...children.values()].sort((left, right) => left.rawPosition - right.rawPosition);
}
async function fetchGuildChannels(interaction) {
  try { return [...(await interaction.guild.channels.fetch()).values()].filter(Boolean); }
  catch (error) { logger.error('Permission sync check could not fetch guild channels', { guildId: interaction.guildId, message: error.message }); throw new Error('I could not retrieve this server\u2019s channels. Please check my server permissions and try again.'); }
}
function categoriesFrom(channels) { return channels.filter((channel) => channel.type === ChannelType.GuildCategory).sort((left, right) => left.rawPosition - right.rawPosition); }
function categorySelect(categories, page, selectedCategoryId) {
  const options = categories.slice(page * MAX_CATEGORIES_PER_PAGE, (page + 1) * MAX_CATEGORIES_PER_PAGE).map((category) => new StringSelectMenuOptionBuilder().setLabel(category.name.slice(0, 100)).setValue(category.id).setDefault(category.id === selectedCategoryId));
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`${SELECT_PREFIX}${page}`).setPlaceholder('Select a category').addOptions(options));
}
function controls(categories, categoryPage, selectedCategoryId, resultPage, children) {
  const rows = [categorySelect(categories, categoryPage, selectedCategoryId)];
  const buttons = []; const categoryPages = Math.ceil(categories.length / MAX_CATEGORIES_PER_PAGE); const channelPages = Math.ceil(children.length / MAX_CHANNELS_PER_PAGE);
  if (categoryPages > 1) {
    buttons.push(new ButtonBuilder().setCustomId(`${PAGE_PREFIX}categories:${Math.max(0, categoryPage - 1)}:${selectedCategoryId || 'none'}:${resultPage}`).setLabel('Previous categories').setStyle(ButtonStyle.Secondary).setDisabled(categoryPage === 0));
    buttons.push(new ButtonBuilder().setCustomId(`${PAGE_PREFIX}categories:${Math.min(categoryPages - 1, categoryPage + 1)}:${selectedCategoryId || 'none'}:${resultPage}`).setLabel('More categories').setStyle(ButtonStyle.Secondary).setDisabled(categoryPage >= categoryPages - 1));
  }
  if (selectedCategoryId && channelPages > 1) {
    buttons.push(new ButtonBuilder().setCustomId(`${PAGE_PREFIX}channels:${categoryPage}:${selectedCategoryId}:${Math.max(0, resultPage - 1)}`).setLabel('Previous channels').setStyle(ButtonStyle.Secondary).setDisabled(resultPage === 0));
    buttons.push(new ButtonBuilder().setCustomId(`${PAGE_PREFIX}channels:${categoryPage}:${selectedCategoryId}:${Math.min(channelPages - 1, resultPage + 1)}`).setLabel('More channels').setStyle(ButtonStyle.Secondary).setDisabled(resultPage >= channelPages - 1));
  }
  if (buttons.length) rows.push(new ActionRowBuilder().addComponents(buttons));
  return rows;
}
function buildPayload(categories, channels, categoryPage, selectedCategoryId, resultPage, guild) {
  if (!categories.length) return { embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🔐 Permission Sync Checker').setDescription('No categories were found in this server.')], components: [], allowedMentions: { parse: [] } };
  const category = categories.find((candidate) => candidate.id === selectedCategoryId);
  if (!category) return { embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🔐 Permission Sync Checker').setDescription('Select a category to check its channel permissions.')], components: controls(categories, categoryPage, null, 0, []), allowedMentions: { parse: [] } };
  const children = childrenForCategory(category, channels);
  const report = formatCategory(category, children, guild);
  const start = resultPage * MAX_CHANNELS_PER_PAGE;
  const visibleReport = formatCategory(category, children.slice(start, start + MAX_CHANNELS_PER_PAGE), guild);
  const description = [...visibleReport.lines, '', '────────────────────', 'Summary', `${CATEGORY_SYNCED} Synced: ${report.synced}`, `${CATEGORY_NOT_SYNCED} Not Synced: ${report.notSynced}`, `📊 Total: ${children.length}`, children.length > MAX_CHANNELS_PER_PAGE ? `Showing channels ${start + 1}–${Math.min(start + MAX_CHANNELS_PER_PAGE, children.length)} of ${children.length}.` : ''].filter(Boolean).join('\n');
  return { embeds: [new EmbedBuilder().setColor(report.notSynced ? 0xFEE75C : 0x57F287).setTitle('🔐 Permission Sync Check').setDescription(description.slice(0, 4096))], components: controls(categories, categoryPage, category.id, resultPage, children), allowedMentions: { parse: [] } };
}
async function render(interaction, { categoryPage = 0, selectedCategoryId = null, resultPage = 0 } = {}) {
  assertCanCheckPermissionSync(interaction);
  const channels = await fetchGuildChannels(interaction); const categories = categoriesFrom(channels);
  const guild = { ...interaction.guild, channels: { cache: new Map(channels.map((channel) => [channel.id, channel])) } };
  const boundedCategoryPage = Math.min(Math.max(0, categoryPage), Math.max(0, Math.ceil(categories.length / MAX_CATEGORIES_PER_PAGE) - 1));
  const category = categories.find((candidate) => candidate.id === selectedCategoryId);
  const childCount = category ? childrenForCategory(category, channels).length : 0;
  const boundedResultPage = Math.min(Math.max(0, resultPage), Math.max(0, Math.ceil(childCount / MAX_CHANNELS_PER_PAGE) - 1));
  return buildPayload(categories, channels, boundedCategoryPage, category?.id || null, boundedResultPage, guild);
}
async function execute(interaction) { assertCanCheckPermissionSync(interaction); await interaction.deferReply({ flags: MessageFlags.Ephemeral }); await interaction.editReply(await render(interaction)); }
async function handleSelect(interaction) {
  if (!interaction.customId.startsWith(SELECT_PREFIX)) return false;
  const categoryPage = Number(interaction.customId.slice(SELECT_PREFIX.length)); const selectedCategoryId = interaction.values?.[0];
  if (!Number.isInteger(categoryPage) || !selectedCategoryId) throw new Error('That category selection is invalid.');
  await interaction.update(await render(interaction, { categoryPage, selectedCategoryId })); return true;
}
async function handleButton(interaction) {
  if (!interaction.customId.startsWith(PAGE_PREFIX)) return false;
  const [action, categoryPageText, selectedCategoryId, resultPageText] = interaction.customId.slice(PAGE_PREFIX.length).split(':'); const categoryPage = Number(categoryPageText); const resultPage = Number(resultPageText);
  if (!['categories', 'channels'].includes(action) || !Number.isInteger(categoryPage) || !Number.isInteger(resultPage)) throw new Error('That permission sync control is invalid.');
  await interaction.update(await render(interaction, { categoryPage, selectedCategoryId: selectedCategoryId === 'none' ? null : selectedCategoryId, resultPage })); return true;
}
function isCheckSyncComponent(customId) { return customId?.startsWith(SELECT_PREFIX) || customId?.startsWith(PAGE_PREFIX); }

module.exports = { execute, handleSelect, handleButton, isCheckSyncComponent, normalizeOverwrite, differentOverwriteTargets, differentPermissions, overwriteDifferences, formatCategory, childrenForCategory, splitLinesIntoDescriptions };