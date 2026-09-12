const { EmbedBuilder } = require('discord.js');
const notificationRepository = require('../database/repositories/notificationRepository');
const { mentionText } = require('../utils/mentions');

const MILESTONES = [20, 10, 5, 0];

function milestoneFlag(milestone) {
  if (milestone === 20) return 'milestone_20_triggered';
  if (milestone === 10) return 'milestone_10_triggered';
  if (milestone === 5) return 'milestone_5_triggered';
  if (milestone === 0) return 'target_triggered';
  throw new Error('Unknown milestone.');
}

function nextMilestone(config, currentCount) {
  for (const distance of MILESTONES) {
    const threshold = config.target_count - distance;
    if (threshold < 0) continue;
    if (currentCount === threshold && !config[milestoneFlag(distance)]) return distance;
  }
  return null;
}

async function countRoleMembers(guild, roleId) {
  const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
  if (!role) throw new Error('The monitored role no longer exists.');
  if (guild.members.fetch) await guild.members.fetch().catch(() => null);
  const members = guild.members.cache.filter((member) => !member.user?.bot && member.roles.cache.has(roleId));
  return { role, count: members.size };
}

function pingFor(config) {
  return mentionText(config.ping_type, config.ping_id);
}

function notificationText(config, roleName, currentCount, milestone, test = false) {
  const prefix = test ? '[Test] ' : '';
  if (milestone === 0) {
    return `${pingFor(config)} ${prefix}Target reached!\n${roleName} has reached ${currentCount}/${config.target_count} holders.`;
  }
  return `${pingFor(config)} ${prefix}Holder milestone alert!\n${roleName} has reached ${currentCount}/${config.target_count} holders.\nOnly ${Math.max(0, config.target_count - currentCount)} more holders to reach the target.`;
}

function notificationEmbed(config, roleName, currentCount, milestone, test = false) {
  const targetReached = milestone === 0;
  return new EmbedBuilder()
    .setColor(targetReached ? 0x57F287 : 0xFEE75C)
    .setTitle(test ? 'Notification Test' : targetReached ? 'Target Reached' : 'Holder Milestone Alert')
    .addFields(
      { name: 'Role', value: roleName, inline: true },
      { name: 'Current', value: `${currentCount}/${config.target_count}`, inline: true },
      { name: 'Distance', value: `${Math.max(0, config.target_count - currentCount)}`, inline: true },
    )
    .setTimestamp();
}

async function sendNotification({ client, guild, config, milestone, test = false }) {
  const { role, count } = await countRoleMembers(guild, config.role_id);
  const channel = guild.channels.cache.get(config.channel_id) || await client.channels.fetch(config.channel_id).catch(() => null);
  if (!channel?.send) throw new Error('The notification channel no longer exists or is unavailable.');
  await channel.send({
    content: notificationText(config, role.name, count, milestone, test),
    embeds: [notificationEmbed(config, role.name, count, milestone, test)],
    allowedMentions: config.ping_type === 'role'
      ? { parse: [], roles: [config.ping_id], users: [] }
      : { parse: [], users: [config.ping_id], roles: [] },
  });
  return { role, count };
}

async function evaluateNotification(client, config) {
  if (!config.enabled) return null;
  const guild = client.guilds.cache.get(config.guild_id) || await client.guilds.fetch(config.guild_id).catch(() => null);
  if (!guild) return null;
  const { count } = await countRoleMembers(guild, config.role_id);
  const milestone = nextMilestone(config, count);
  if (milestone == null) return null;
  await sendNotification({ client, guild, config, milestone });
  notificationRepository.markTriggered(config.guild_id, config.id, milestone);
  return { configId: config.id, milestone, count };
}

async function evaluateGuildNotifications(client, guildId) {
  const results = [];
  for (const config of notificationRepository.listEnabled(guildId)) {
    const result = await evaluateNotification(client, config).catch(() => null);
    if (result) results.push(result);
  }
  return results;
}

async function handleGuildMemberAdd(client, member) {
  return evaluateGuildNotifications(client, member.guild.id);
}

module.exports = {
  MILESTONES,
  countRoleMembers,
  evaluateGuildNotifications,
  evaluateNotification,
  handleGuildMemberAdd,
  milestoneFlag,
  nextMilestone,
  notificationText,
  sendNotification,
};
