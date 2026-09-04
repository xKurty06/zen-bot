require('dotenv').config();
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..', '..');

function getRequired(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

module.exports = {
  rootDir,
  token: () => getRequired('DISCORD_TOKEN'),
  clientId: () => getRequired('CLIENT_ID'),
  guildId: () => process.env.GUILD_ID || null,
  databasePath: () => process.env.DATABASE_PATH || path.join(rootDir, 'data', 'bot.sqlite'),
};
