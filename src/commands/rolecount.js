const { EmbedBuilder, MessageFlags } = require('discord.js');
const { countRoleMembers } = require('../services/notificationService');
const { assertCanCheckPermissionSync } = require('../services/permissionService');
const { DEFAULT_EMBED_COLOR_INT } = require('../config/brand');
const verifiedRoleId = '1544593742651064360';

async function execute(interaction) {
  assertCanCheckPermissionSync(interaction);
  const role = interaction.options.getRole('role', true);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await countRoleMembers(interaction.guild, role.id);
  const verifiedResult = await countTargetRoleMembers(interaction.guild, role.id, true);
  const unverifiedCount = await countTargetRoleMembers(interaction.guild, role.id, false);
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(DEFAULT_EMBED_COLOR_INT)
        .setTitle('Role Count')
        .setDescription(`<@&${result.role.id}>\nCurrent holders: ${result.count} members\nVerified: ${verifiedResult.count} members\nUnverified: ${unverifiedCount.count} members`),
    ],
  });
}

async function countTargetRoleMembers(guild, roleId, verified=true) {
  const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
  if (!role) throw new Error('The target role no longer exists.');
  if (guild.members.fetch) await guild.members.fetch().catch(() => null);
  const members = guild.members.cache.filter((member) => !member.user?.bot && member.roles.cache.has(roleId));
  if (verified) {
    const verifiedRole = guild.roles.cache.get(verifiedRoleId) || await guild.roles.fetch(verifiedRoleId).catch(() => null);
    if (!verifiedRole) throw new Error('The verified role no longer exists.');
    return { role, count: members.filter((member) => member.roles.cache.has(verifiedRole.id)).size };
  } else {
    const verifiedRole = guild.roles.cache.get(verifiedRoleId) || await guild.roles.fetch(verifiedRoleId).catch(() => null);
    if (!verifiedRole) throw new Error('The verified role no longer exists.');
    return { role, count: members.filter((member) => !member.roles.cache.has(verifiedRole.id)).size };
  }
}


//   async function countRoleMembers(guild, roleId) {
//   const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
//   if (!role) throw new Error('The monitored role no longer exists.');
//   if (guild.members.fetch) await guild.members.fetch().catch(() => null);
//   const members = guild.members.cache.filter((member) => !member.user?.bot && member.roles.cache.has(roleId));
//   return { role, count: members.size };
// }
module.exports = { execute };
