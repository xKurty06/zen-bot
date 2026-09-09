const { assertValidConfiguration } = require('../embed-builder/validators');
const templateRepository = require('../database/repositories/templateRepository');

function normalizeName(name) {
  const normalized = String(name || '').trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!normalized || normalized.length > 64) throw new Error('Template names must be 1-64 characters and use letters, numbers, dashes, or underscores.');
  return normalized;
}

function saveTemplate({ guildId, name, configuration, userId }) {
  const normalized = normalizeName(name);
  assertValidConfiguration(configuration);
  return templateRepository.upsert({ guildId, name: normalized, configuration, createdBy: userId });
}

function createDuplicate({ guildId, fromName, toName, userId }) {
  const source = templateRepository.findByName(guildId, normalizeName(fromName));
  if (!source) throw new Error(`Template "${fromName}" was not found.`);
  const normalizedTarget = normalizeName(toName);
  if (normalizedTarget === source.name) throw new Error('Choose a different name for the duplicate.');
  if (templateRepository.findByName(guildId, normalizedTarget)) {
    throw new Error(`Template "${normalizedTarget}" already exists.`);
  }
  return templateRepository.create({ guildId, name: normalizedTarget, configuration: source.configuration, createdBy: userId });
}

module.exports = { normalizeName, saveTemplate, createDuplicate };
