const { Client, Events, GatewayIntentBits, MessageFlags } = require('discord.js');
const config = require('./config');
const logger = require('./utils/logger');
const commands = require('./commands');
const { initDatabase, closeDatabase } = require('./database/database');
const { handleButton, handleSelect, handleModalSubmit, parseCustomId } = require('./interactions');
const checksync = require('./commands/checksync');
const templateRepository = require('./database/repositories/templateRepository');

function autocompleteTemplateNames(guildId, query = '') {
  const lowerQuery = query.trim().toLowerCase();
  return templateRepository.listNames(guildId)
    .filter((name) => !lowerQuery || name.toLowerCase().includes(lowerQuery))
    .slice(0, 25)
    .map((name) => ({ name, value: name }));
}
const { assertCanManageEmbeds, assertCanCheckPermissionSync } = require('./services/permissionService');
const { deployCommands } = require('../scripts/deploy-commands');

const botStartedAt = Date.now();
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});
client.uptimeStartedAt = botStartedAt;

async function safeReply(interaction, content) {
  const payload = { content, flags: MessageFlags.Ephemeral, components: [], embeds: [] };
  try {
    if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
    else await interaction.reply(payload);
  } catch (error) {
    logger.error('Failed to send interaction error response', { message: error.message });
  }
}

function isUnknownInteraction(error) {
  return error?.code === 10062 || error?.rawError?.code === 10062 || error?.message === 'Unknown interaction';
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

    if (interaction.isAutocomplete()) {
      const focused = interaction.options.getFocused(true);
      if (focused && (focused.name === 'name' || focused.name === 'from' || focused.name === 'to')) {
        await interaction.respond(autocompleteTemplateNames(interaction.guildId, focused.value));
        return;
      }
      await interaction.respond([]);
      return;
    }

    if (interaction.isChatInputCommand()) {
      const command = commands[interaction.commandName];
      if (!command) throw new Error('Unknown command.');
      await command.execute(interaction);
      return;
    }

    if (interaction.isButton()) {
      if (checksync.isCheckSyncComponent(interaction.customId)) {
        assertCanCheckPermissionSync(interaction);
        await checksync.handleButton(interaction);
        return;
      }
      if (interaction.customId.startsWith('template_delete_')) {
        assertCanManageEmbeds(interaction);
        if (interaction.customId === 'template_delete_cancel') {
          await interaction.update({ content: 'Delete cancelled.', components: [] });
          return;
        }
        const templateId = Number(interaction.customId.replace('template_delete_confirm:', ''));
        if (!Number.isSafeInteger(templateId)) throw new Error('That delete confirmation is invalid.');
        const template = templateRepository.findMetadataById(templateId);
        if (!template || template.guild_id !== interaction.guildId) {
          await interaction.update({ content: 'That template was already deleted or replaced.', components: [] });
          return;
        }
        const deleted = templateRepository.deleteById(interaction.guildId, templateId);
        await interaction.update({ content: deleted ? `Deleted template "${template.name}".` : `Template "${template.name}" was already missing.`, components: [] });
        return;
      }
      if (parseCustomId(interaction.customId)) {
        assertCanManageEmbeds(interaction);
        await handleButton(interaction);
      }
      return;
    }

    if (interaction.isAnySelectMenu()) {
      if (checksync.isCheckSyncComponent(interaction.customId)) {
        assertCanCheckPermissionSync(interaction);
        await checksync.handleSelect(interaction);
        return;
      }
      if (parseCustomId(interaction.customId)) {
        assertCanManageEmbeds(interaction);
        await handleSelect(interaction);
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      const parsed = parseCustomId(interaction.customId);
      if (parsed && parsed.type === 'modal') {
        assertCanManageEmbeds(interaction);
        const sessionManager = require('./embed-builder/sessionManager');
        const session = sessionManager.get(interaction.guildId, interaction.user.id, parsed.sessionId);
        if (!session) throw new Error('This builder session has expired. Run /embed create again.');
        if (session.revision !== parsed.revision) throw new Error('This builder modal is stale. Please use the latest builder message.');
        await handleModalSubmit(interaction, session, parsed.action, parsed.value);
      }
    }
  } catch (error) {
    if (isUnknownInteraction(error)) {
      logger.warn('Interaction response expired before it could be acknowledged', { command: interaction.commandName, customId: interaction.customId });
      return;
    }
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

async function start() {
  await deployCommands();
  await client.login(config.token());
}

start().catch((error) => {
  logger.error('Bot startup failed', { message: error.message });
  closeDatabase();
  process.exit(1);
});
