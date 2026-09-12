const { EmbedBuilder, MessageFlags } = require('discord.js');
const { countRoleMembers } = require('../services/notificationService');
const { assertCanCheckPermissionSync } = require('../services/permissionService');

async function execute(interaction) {
  assertCanCheckPermissionSync(interaction);
  const role = interaction.options.getRole('role', true);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await countRoleMembers(interaction.guild, role.id);
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Role Count')
        .setDescription(`${result.role.name}\nCurrent holders: ${result.count} members`),
    ],
  });
}

module.exports = { execute };
