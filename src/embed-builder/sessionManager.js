const { BuilderSession } = require('./BuilderSession');

const SESSION_TTL_MS = 60 * 60 * 1000;

class SessionManager {
  constructor() {
    this.sessions = new Map();
  }

  create(input) {
    const session = new BuilderSession(input);
    this.sessions.set(this.key(session.guildId, session.userId, session.id), session);
    return session;
  }

  key(guildId, userId, sessionId) {
    return `${guildId}:${userId}:${sessionId}`;
  }

  get(guildId, userId, sessionId) {
    this.expire();

    const key = this.key(guildId, userId, sessionId);
    const exact = this.sessions.get(key);
    if (exact) {
      exact.touch();
      return exact;
    }

    const latest = this.latest(guildId, userId);
    if (latest) {
      latest.touch();
      return latest;
    }

    return null;
  }

  latest(guildId, userId) {
    this.expire();
    return [...this.sessions.values()]
      .filter((session) => session.guildId === guildId && session.userId === userId)
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt)[0] || null;
  }

  delete(session) {
    this.sessions.delete(this.key(session.guildId, session.userId, session.id));
  }

  expire() {
    const now = Date.now();
    for (const [key, session] of this.sessions.entries()) {
      if (now - session.lastActivityAt.getTime() > SESSION_TTL_MS) this.sessions.delete(key);
    }
  }
}

module.exports = new SessionManager();
