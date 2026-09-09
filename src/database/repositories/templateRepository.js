const { getDb } = require('../database');

function rowToTemplate(row) {
  if (!row) return null;
  try {
    return { ...row, configuration: JSON.parse(row.configuration) };
  } catch {
    throw new Error(`Saved template "${row.name}" has corrupt configuration data.`);
  }
}

class TemplateRepository {
  listNames(guildId) {
    return getDb().prepare('SELECT name FROM embed_templates WHERE guild_id = ? ORDER BY name').all(guildId).map((row) => row.name);
  }

  list(guildId) {
    return getDb().prepare('SELECT * FROM embed_templates WHERE guild_id = ? ORDER BY name').all(guildId).map(rowToTemplate);
  }

  findByName(guildId, name) {
    return rowToTemplate(getDb().prepare('SELECT * FROM embed_templates WHERE guild_id = ? AND name = ?').get(guildId, name));
  }

  findMetadataByName(guildId, name) {
    return getDb().prepare('SELECT id, guild_id, name, created_by, created_at, updated_at FROM embed_templates WHERE guild_id = ? AND name = ?').get(guildId, name) || null;
  }

  findById(id) {
    return rowToTemplate(getDb().prepare('SELECT * FROM embed_templates WHERE id = ?').get(id));
  }

  findMetadataById(id) {
    return getDb().prepare('SELECT id, guild_id, name, created_by, created_at, updated_at FROM embed_templates WHERE id = ?').get(id) || null;
  }

  upsert({ guildId, name, configuration, createdBy }) {
    const now = new Date().toISOString();
    getDb().prepare(`
      INSERT INTO embed_templates (guild_id, name, configuration, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id, name) DO UPDATE SET configuration = excluded.configuration, updated_at = excluded.updated_at
    `).run(guildId, name, JSON.stringify(configuration), createdBy, now, now);
    return this.findByName(guildId, name);
  }

  create({ guildId, name, configuration, createdBy }) {
    const now = new Date().toISOString();
    let info;
    try {
      info = getDb().prepare(`
        INSERT INTO embed_templates (guild_id, name, configuration, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(guildId, name, JSON.stringify(configuration), createdBy, now, now);
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new Error(`Template "${name}" already exists.`);
      throw error;
    }
    return this.findById(info.lastInsertRowid);
  }

  delete(guildId, name) {
    return getDb().prepare('DELETE FROM embed_templates WHERE guild_id = ? AND name = ?').run(guildId, name).changes;
  }

  deleteById(guildId, id) {
    return getDb().prepare('DELETE FROM embed_templates WHERE guild_id = ? AND id = ?').run(guildId, id).changes;
  }
}

module.exports = new TemplateRepository();
