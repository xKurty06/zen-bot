const DISCORD_ID = '\\d{17,20}';
const MENTION_RE = new RegExp(`<(@!?|@&|#)(${DISCORD_ID})>`, 'g');

function mentionText(type, id) {
  if (!/^\d{17,20}$/.test(String(id || ''))) throw new Error('Discord mention IDs must be 17-20 digits.');
  if (type === 'role') return `<@&${id}>`;
  if (type === 'user') return `<@${id}>`;
  if (type === 'channel') return `<#${id}>`;
  throw new Error('Unsupported mention type.');
}

function appendMention(content, type, id) {
  const current = String(content || '').trimEnd();
  return `${current}${current ? ' ' : ''}${mentionText(type, id)}`;
}

function extractAllowedMentions(content) {
  const users = new Set();
  const roles = new Set();
  for (const match of String(content || '').matchAll(MENTION_RE)) {
    if (match[1] === '@&') roles.add(match[2]);
    if (match[1] === '@' || match[1] === '@!') users.add(match[2]);
  }
  return { parse: [], users: [...users], roles: [...roles] };
}

function extractMentionIds(content) {
  const ids = { users: new Set(), roles: new Set(), channels: new Set() };
  for (const match of String(content || '').matchAll(MENTION_RE)) {
    if (match[1] === '@&') ids.roles.add(match[2]);
    if (match[1] === '@' || match[1] === '@!') ids.users.add(match[2]);
    if (match[1] === '#') ids.channels.add(match[2]);
  }
  return { users: [...ids.users], roles: [...ids.roles], channels: [...ids.channels] };
}

function neutralizeMassMentions(content) {
  return String(content || '').replace(/@(everyone|here)\b/gi, '@\u200b$1');
}

module.exports = { appendMention, extractAllowedMentions, extractMentionIds, mentionText, neutralizeMassMentions };
