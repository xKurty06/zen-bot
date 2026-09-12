const { MessageFlags } = require('discord.js');
const notificationRepository = require('../database/repositories/notificationRepository');
const { assertCanManageEmbeds } = require('../services/permissionService');
const { countRoleMembers } = require('../services/notificationService');

function pingFromMentionable(mentionable) {
  if (!mentionable) throw new Error('Choose a user or role to ping.');
  if (mentionable.user) return { pingType: 'user', pingId: mentionable.user.id, label: `<@${mentionable.user.id}>` };
  return { pingType: 'role', pingId: mentionable.id, label: `<@&${mentionable.id}>` };
}

function assertSafePing(interaction, ping) {
  if (ping.pingType === 'role' && ping.pingId === interaction.guildId) {
    throw new Error('Choose a specific role or user to ping; @everyone is not allowed for notifications.');
  }
}

function summarize(config, guild) {
  const role = guild.roles.cache.get(config.role_id);
  const channel = guild.channels.cache.get(config.channel_id);
  const ping = config.ping_type === 'role' ? `<@&${config.ping_id}>` : `<@${config.ping_id}>`;
  return [
    `#${config.id} ${config.enabled ? 'enabled' : 'disabled'}`,
    `Role: ${role?.name || config.role_id}`,
    `Target: ${config.target_count}`,
    `Channel: ${channel ? `<#${channel.id}>` : config.channel_id}`,
    `Ping: ${ping}`,
    `Triggered: 20=${config.milestone_20_triggered ? 'yes' : 'no'}, 10=${config.milestone_10_triggered ? 'yes' : 'no'}, 5=${config.milestone_5_triggered ? 'yes' : 'no'}, target=${config.target_triggered ? 'yes' : 'no'}`,
  ].join('\n');
}

async function create(interaction) {
  const role = interaction.options.getRole('role', true);
  const targetCount = interaction.options.getInteger('target', true);
  const channel = interaction.options.getChannel('channel', true);
  const ping = pingFromMentionable(interaction.options.getMentionable('ping', true));
  assertSafePing(interaction, ping);
  if (role.managed) throw new Error('Choose a normal server role, not an integration-managed role.');
  if (!channel?.send) throw new Error('Choose a channel where I can send messages.');
  const config = notificationRepository.create({
    guildId: interaction.guildId,
    roleId: role.id,
    targetCount,
    channelId: channel.id,
    pingType: ping.pingType,
    pingId: ping.pingId,
    createdBy: interaction.user.id,
  });
  await interaction.reply({ content: `Created notification #${config.id} for ${role.name} at target ${targetCount}.`, flags: MessageFlags.Ephemeral });
}

async function list(interaction) {
  const configs = notificationRepository.list(interaction.guildId);
  const content = configs.length ? configs.map((config) => summarize(config, interaction.guild)).join('\n\n') : 'No role notifications configured.';
  await interaction.reply({ content: content.slice(0, 1900), flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
}

async function edit(interaction) {
  const id = interaction.options.getInteger('id', true);
  const existing = notificationRepository.findById(interaction.guildId, id);
  if (!existing) throw new Error('That notification configuration was not found.');
  const role = interaction.options.getRole('role') || interaction.guild.roles.cache.get(existing.role_id);
  const targetCount = interaction.options.getInteger('target') || existing.target_count;
  const channel = interaction.options.getChannel('channel') || interaction.guild.channels.cache.get(existing.channel_id);
  const mentionable = interaction.options.getMentionable('ping');
  const ping = mentionable ? pingFromMentionable(mentionable) : { pingType: existing.ping_type, pingId: existing.ping_id };
  assertSafePing(interaction, ping);
  if (!role) throw new Error('The saved role is unavailable. Choose a replacement role.');
  if (!channel?.send) throw new Error('The saved channel is unavailable. Choose a replacement channel.');
  const updated = notificationRepository.update({
    guildId: interaction.guildId,
    id,
    roleId: role.id,
    targetCount,
    channelId: channel.id,
    pingType: ping.pingType,
    pingId: ping.pingId,
  });
  await interaction.reply({ content: `Updated notification #${updated.id}. Milestone progress was preserved; use /notify reset to start a new cycle.`, flags: MessageFlags.Ephemeral });
}

async function view(interaction) {
  const config = notificationRepository.findById(interaction.guildId, interaction.options.getInteger('id', true));
  if (!config) throw new Error('That notification configuration was not found.');
  let countLine = 'Current holders: unavailable';
  try {
    const { count } = await countRoleMembers(interaction.guild, config.role_id);
    countLine = `Current holders: ${count}`;
  } catch {
    countLine = 'Current holders: role unavailable';
  }
  await interaction.reply({ content: `${summarize(config, interaction.guild)}\n${countLine}`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
}

async function setEnabled(interaction, enabled) {
  const config = notificationRepository.setEnabled(interaction.guildId, interaction.options.getInteger('id', true), enabled);
  if (!config) throw new Error('That notification configuration was not found.');
  await interaction.reply({ content: `${enabled ? 'Enabled' : 'Disabled'} notification #${config.id}.`, flags: MessageFlags.Ephemeral });
}

async function reset(interaction) {
  const config = notificationRepository.reset(interaction.guildId, interaction.options.getInteger('id', true));
  if (!config) throw new Error('That notification configuration was not found.');
  await interaction.reply({ content: `Reset milestone progress for notification #${config.id}.`, flags: MessageFlags.Ephemeral });
}

async function remove(interaction) {
  const deleted = notificationRepository.delete(interaction.guildId, interaction.options.getInteger('id', true));
  if (!deleted) throw new Error('That notification configuration was not found.');
  await interaction.reply({ content: 'Notification deleted.', flags: MessageFlags.Ephemeral });
}

async function execute(interaction) {
  assertCanManageEmbeds(interaction);
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'create') return create(interaction);
  if (subcommand === 'list') return list(interaction);
  if (subcommand === 'view') return view(interaction);
  if (subcommand === 'edit') return edit(interaction);
  if (subcommand === 'enable') return setEnabled(interaction, true);
  if (subcommand === 'disable') return setEnabled(interaction, false);
  if (subcommand === 'reset') return reset(interaction);
  if (subcommand === 'delete') return remove(interaction);
  throw new Error('Unsupported notify subcommand.');
}

module.exports = { execute, pingFromMentionable };
