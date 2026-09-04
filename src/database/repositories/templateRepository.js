const { getDb } = require('../database');

function rowToTemplate(row) {
  if (!row) return null;
  return { ...row, configuration: JSON.parse(row.configuration) };
}

class TemplateRepository {
  list(guildId) {
    return getDb().prepare('SELECT * FROM embed_templates WHERE guild_id = ? ORDER BY name').all(guildId).map(rowToTemplate);
  }

  findByName(guildId, name) {
    return rowToTemplate(getDb().prepare('SELECT * FROM embed_templates WHERE guild_id = ? AND name = ?').get(guildId, name));
  }

  findById(id) {
    return rowToTemplate(getDb().prepare('SELECT * FROM embed_templates WHERE id = ?').get(id));
  }

  upsert({ guildId, name, configuration, createdBy }) {
    const now = new Date().toISOString();
    const existing = this.findByName(guildId, name);
    if (existing) {
      getDb().prepare('UPDATE embed_templates SET configuration = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(configuration), now, existing.id);
      return this.findByName(guildId, name);
    }
    const info = getDb().prepare(`
      INSERT INTO embed_templates (guild_id, name, configuration, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(guildId, name, JSON.stringify(configuration), createdBy, now, now);
    return this.findById(info.lastInsertRowid);
  }

  create({ guildId, name, configuration, createdBy }) {
    const now = new Date().toISOString();
    const info = getDb().prepare(`
      INSERT INTO embed_templates (guild_id, name, configuration, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(guildId, name, JSON.stringify(configuration), createdBy, now, now);
    return this.findById(info.lastInsertRowid);
  }

  delete(guildId, name) {
    return getDb().prepare('DELETE FROM embed_templates WHERE guild_id = ? AND name = ?').run(guildId, name).changes;
  }
}

module.exports = new TemplateRepository();
