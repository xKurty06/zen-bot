const { getDb } = require('../database');

function rowToManaged(row) {
  if (!row) return null;
  try {
    return { ...row, configuration: JSON.parse(row.configuration) };
  } catch {
    throw new Error(`Managed message "${row.message_id}" has corrupt configuration data.`);
  }
}

class ManagedMessageRepository {
  list(guildId) {
    return getDb().prepare('SELECT * FROM managed_messages WHERE guild_id = ? ORDER BY updated_at DESC').all(guildId).map(rowToManaged);
  }

  findById(id) {
    return rowToManaged(getDb().prepare('SELECT * FROM managed_messages WHERE id = ?').get(id));
  }

  findByMessage(guildId, messageId) {
    return rowToManaged(getDb().prepare('SELECT * FROM managed_messages WHERE guild_id = ? AND message_id = ?').get(guildId, messageId));
  }

  save({ guildId, channelId, messageId, templateId = null, configuration }) {
    const now = new Date().toISOString();
    const existing = this.findByMessage(guildId, messageId);
    if (existing) {
      getDb().prepare(`
        UPDATE managed_messages
        SET channel_id = ?, template_id = ?, configuration = ?, updated_at = ?
        WHERE id = ?
      `).run(channelId, templateId, JSON.stringify(configuration), now, existing.id);
      return this.findById(existing.id);
    }
    const info = getDb().prepare(`
      INSERT INTO managed_messages (guild_id, channel_id, message_id, template_id, configuration, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(guildId, channelId, messageId, templateId, JSON.stringify(configuration), now, now);
    return this.findById(info.lastInsertRowid);
  }

  updateIfCurrent({ id, guildId, channelId, messageId, templateId, configuration, expectedUpdatedAt }) {
    const now = new Date().toISOString();
    const result = getDb().prepare(`
      UPDATE managed_messages
      SET channel_id = ?, template_id = ?, configuration = ?, updated_at = ?
      WHERE id = ? AND guild_id = ? AND updated_at = ?
    `).run(channelId, templateId, JSON.stringify(configuration), now, id, guildId, expectedUpdatedAt);
    return result.changes ? this.findById(id) : null;
  }
}

module.exports = new ManagedMessageRepository();
