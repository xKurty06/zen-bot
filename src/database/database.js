const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const config = require('../config');
const logger = require('../utils/logger');

let db;

function initDatabase() {
  const dbPath = config.databasePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS embed_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      configuration TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(guild_id, name)
    );

    CREATE TABLE IF NOT EXISTS managed_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      template_id INTEGER,
      configuration TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(guild_id, channel_id, message_id),
      FOREIGN KEY(template_id) REFERENCES embed_templates(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS role_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      target_count INTEGER NOT NULL,
      channel_id TEXT NOT NULL,
      ping_type TEXT NOT NULL,
      ping_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      milestone_20_triggered INTEGER NOT NULL DEFAULT 0,
      milestone_10_triggered INTEGER NOT NULL DEFAULT 0,
      milestone_5_triggered INTEGER NOT NULL DEFAULT 0,
      target_triggered INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_role_notifications_guild_role
      ON role_notifications (guild_id, role_id, enabled);
  `);
  logger.info('Database initialized');
  return db;
}

function getDb() {
  if (!db) return initDatabase();
  return db;
}

function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    logger.info('Database connection closed');
  }
}

module.exports = { initDatabase, getDb, closeDatabase };
