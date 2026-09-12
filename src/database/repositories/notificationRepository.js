const { getDb } = require('../database');

function bool(value) {
  return Boolean(value);
}

function rowToNotification(row) {
  if (!row) return null;
  return {
    ...row,
    enabled: bool(row.enabled),
    milestone_20_triggered: bool(row.milestone_20_triggered),
    milestone_10_triggered: bool(row.milestone_10_triggered),
    milestone_5_triggered: bool(row.milestone_5_triggered),
    target_triggered: bool(row.target_triggered),
  };
}

function flagsToColumns(flags = {}) {
  return {
    milestone_20_triggered: flags.milestone_20_triggered ? 1 : 0,
    milestone_10_triggered: flags.milestone_10_triggered ? 1 : 0,
    milestone_5_triggered: flags.milestone_5_triggered ? 1 : 0,
    target_triggered: flags.target_triggered ? 1 : 0,
  };
}

class NotificationRepository {
  list(guildId) {
    return getDb().prepare('SELECT * FROM role_notifications WHERE guild_id = ? ORDER BY id').all(guildId).map(rowToNotification);
  }

  listEnabled(guildId = null) {
    const rows = guildId
      ? getDb().prepare('SELECT * FROM role_notifications WHERE guild_id = ? AND enabled = 1 ORDER BY id').all(guildId)
      : getDb().prepare('SELECT * FROM role_notifications WHERE enabled = 1 ORDER BY id').all();
    return rows.map(rowToNotification);
  }

  findById(guildId, id) {
    return rowToNotification(getDb().prepare('SELECT * FROM role_notifications WHERE guild_id = ? AND id = ?').get(guildId, id));
  }

  create({ guildId, roleId, targetCount, channelId, pingType, pingId, createdBy }) {
    const now = new Date().toISOString();
    const info = getDb().prepare(`
      INSERT INTO role_notifications (guild_id, role_id, target_count, channel_id, ping_type, ping_id, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(guildId, roleId, targetCount, channelId, pingType, pingId, createdBy, now, now);
    return this.findById(guildId, info.lastInsertRowid);
  }

  update({ guildId, id, roleId, targetCount, channelId, pingType, pingId }) {
    const now = new Date().toISOString();
    const result = getDb().prepare(`
      UPDATE role_notifications
      SET role_id = ?, target_count = ?, channel_id = ?, ping_type = ?, ping_id = ?, updated_at = ?
      WHERE guild_id = ? AND id = ?
    `).run(roleId, targetCount, channelId, pingType, pingId, now, guildId, id);
    return result.changes ? this.findById(guildId, id) : null;
  }

  setEnabled(guildId, id, enabled) {
    const now = new Date().toISOString();
    const result = getDb().prepare('UPDATE role_notifications SET enabled = ?, updated_at = ? WHERE guild_id = ? AND id = ?')
      .run(enabled ? 1 : 0, now, guildId, id);
    return result.changes ? this.findById(guildId, id) : null;
  }

  reset(guildId, id) {
    const now = new Date().toISOString();
    const result = getDb().prepare(`
      UPDATE role_notifications
      SET milestone_20_triggered = 0, milestone_10_triggered = 0, milestone_5_triggered = 0, target_triggered = 0, updated_at = ?
      WHERE guild_id = ? AND id = ?
    `).run(now, guildId, id);
    return result.changes ? this.findById(guildId, id) : null;
  }

  markTriggered(guildId, id, milestone) {
    const column = {
      20: 'milestone_20_triggered',
      10: 'milestone_10_triggered',
      5: 'milestone_5_triggered',
      0: 'target_triggered',
    }[milestone];
    if (!column) throw new Error('Unknown notification milestone.');
    const now = new Date().toISOString();
    const result = getDb().prepare(`UPDATE role_notifications SET ${column} = 1, updated_at = ? WHERE guild_id = ? AND id = ?`)
      .run(now, guildId, id);
    return result.changes ? this.findById(guildId, id) : null;
  }

  replaceFlags(guildId, id, flags) {
    const columns = flagsToColumns(flags);
    const now = new Date().toISOString();
    const result = getDb().prepare(`
      UPDATE role_notifications
      SET milestone_20_triggered = ?, milestone_10_triggered = ?, milestone_5_triggered = ?, target_triggered = ?, updated_at = ?
      WHERE guild_id = ? AND id = ?
    `).run(columns.milestone_20_triggered, columns.milestone_10_triggered, columns.milestone_5_triggered, columns.target_triggered, now, guildId, id);
    return result.changes ? this.findById(guildId, id) : null;
  }

  delete(guildId, id) {
    return getDb().prepare('DELETE FROM role_notifications WHERE guild_id = ? AND id = ?').run(guildId, id).changes;
  }
}

module.exports = new NotificationRepository();
