const { Client, Events, GatewayIntentBits } = require('discord.js');
const config = require('./config');
const logger = require('./utils/logger');
const commands = require('./commands');
const { initDatabase, closeDatabase } = require('./database/database');
const { handleButton, handleSelect, handleModalSubmit, parseCustomId } = require('./interactions');
const templateRepository = require('./database/repositories/templateRepository');
const { assertCanManageEmbeds } = require('./services/permissionService');

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

async function safeReply(interaction, content) {
  const payload = { content, ephemeral: true, components: [], embeds: [] };
  try {
    if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
    else await interaction.reply(payload);
  } catch (error) {
    logger.error('Failed to send interaction error response', { message: error.message });
  }
}

client.once(Events.ClientReady, (readyClient) => {
  logger.info(`Bot started as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!interaction.inGuild()) {
      await safeReply(interaction, 'This bot can only be used inside a Discord server.');
      return;
    }

    if (interaction.isChatInputCommand()) {
      const command = commands[interaction.commandName];
      if (!command) throw new Error('Unknown command.');
      await command.execute(interaction);
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith('template_delete_')) {
        assertCanManageEmbeds(interaction);
        if (interaction.customId === 'template_delete_cancel') {
          await interaction.update({ content: 'Delete cancelled.', components: [] });
          return;
        }
        const name = interaction.customId.replace('template_delete_confirm:', '');
        const deleted = templateRepository.delete(interaction.guildId, name);
        await interaction.update({ content: deleted ? `Deleted template "${name}".` : `Template "${name}" was already missing.`, components: [] });
        return;
      }
      if (parseCustomId(interaction.customId)) {
        assertCanManageEmbeds(interaction);
        await handleButton(interaction);
      }
      return;
    }

    if (interaction.isAnySelectMenu()) {
      if (parseCustomId(interaction.customId)) {
        assertCanManageEmbeds(interaction);
        await handleSelect(interaction);
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      const parsed = parseCustomId(interaction.customId);
      if (parsed) {
        assertCanManageEmbeds(interaction);
        const sessionManager = require('./embed-builder/sessionManager');
        const session = sessionManager.get(interaction.guildId, interaction.user.id, parsed.sessionId);
        if (!session) throw new Error('This builder session has expired. Run /embed create again.');
        await handleModalSubmit(interaction, session, parsed.action, parsed.value);
      }
    }
  } catch (error) {
    logger.error('Interaction failed', { message: error.message, command: interaction.commandName, customId: interaction.customId });
    await safeReply(interaction, error.validationErrors ? error.validationErrors.join('\n') : error.message || 'Something went wrong.');
  }
});

async function shutdown(signal) {
  logger.info(`Received ${signal}; shutting down`);
  try {
    client.destroy();
    closeDatabase();
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled promise rejection', { message: error?.message || String(error) });
});

initDatabase();
client.login(config.token());
