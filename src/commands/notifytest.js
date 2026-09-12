const { MessageFlags } = require('discord.js');
const notificationRepository = require('../database/repositories/notificationRepository');
const { assertCanManageEmbeds } = require('../services/permissionService');
const { countRoleMembers, sendNotification } = require('../services/notificationService');

async function execute(interaction) {
  assertCanManageEmbeds(interaction);
  const configs = notificationRepository.list(interaction.guildId);
  if (!configs.length) throw new Error('No role notifications are configured.');
  const id = interaction.options.getInteger('id') || configs[0].id;
  const config = notificationRepository.findById(interaction.guildId, id);
  if (!config) throw new Error('That notification configuration was not found.');
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const distance = Math.max(0, config.target_count - (await countRoleMembers(interaction.guild, config.role_id)).count);
  const milestone = [20, 10, 5].includes(distance) ? distance : 20;
  await sendNotification({ client: interaction.client, guild: interaction.guild, config, milestone, test: true });
  await interaction.editReply({ content: `Sent test notification #${config.id}. Milestone progress was not changed.` });
}

module.exports = { execute };
