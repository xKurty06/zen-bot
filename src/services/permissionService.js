const { PermissionsBitField } = require('discord.js');

function canManageEmbeds(interaction) {
  if (!interaction.inGuild()) return false;
  const permissions = interaction.memberPermissions;
  return Boolean(
    permissions?.has(PermissionsBitField.Flags.Administrator) ||
    permissions?.has(PermissionsBitField.Flags.ManageGuild),
  );
}

function assertCanManageEmbeds(interaction) {
  if (!canManageEmbeds(interaction)) {
    throw new Error('You do not have permission to use this command.');
  }
}

function missingSendPermissions(channel, guildMember) {
  const permissions = channel.permissionsFor(guildMember);
  const required = [
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.SendMessages,
    PermissionsBitField.Flags.EmbedLinks,
    PermissionsBitField.Flags.ReadMessageHistory,
  ];
  return required.filter((permission) => !permissions?.has(permission));
}

module.exports = { canManageEmbeds, assertCanManageEmbeds, missingSendPermissions };
