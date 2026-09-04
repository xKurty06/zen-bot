const { REST, Routes } = require('discord.js');
const config = require('../src/config');
const commands = require('../src/commands/definitions');
const logger = require('../src/utils/logger');

async function main() {
  const rest = new REST({ version: '10' }).setToken(config.token());
  const body = commands.map((command) => command.toJSON());
  const guildId = config.guildId();

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId(), guildId), { body });
    logger.info(`Registered ${body.length} guild commands`);
  } else {
    await rest.put(Routes.applicationCommands(config.clientId()), { body });
    logger.info(`Registered ${body.length} global commands`);
  }
}

main().catch((error) => {
  logger.error('Command deployment failed', { message: error.message });
  process.exit(1);
});
