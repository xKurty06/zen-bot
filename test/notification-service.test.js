const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const notificationRepository = require('../src/database/repositories/notificationRepository');
const {
  countRoleMembers,
  handleGuildMemberAdd,
  nextMilestone,
  notificationText,
} = require('../src/services/notificationService');

function config(overrides = {}) {
  return {
    id: 1,
    enabled: true,
    target_count: 100,
    ping_type: 'role',
    ping_id: '123456789012345678',
    milestone_20_triggered: false,
    milestone_10_triggered: false,
    milestone_5_triggered: false,
    target_triggered: false,
    ...overrides,
  };
}

test('static milestones trigger at 20, 10, 5, and exact target', () => {
  assert.equal(nextMilestone(config(), 79), null);
  assert.equal(nextMilestone(config(), 80), 20);
  assert.equal(nextMilestone(config(), 81), null);
  assert.equal(nextMilestone(config({ milestone_20_triggered: true }), 90), 10);
  assert.equal(nextMilestone(config({ milestone_20_triggered: true }), 91), null);
  assert.equal(nextMilestone(config({ milestone_20_triggered: true, milestone_10_triggered: true }), 95), 5);
  assert.equal(nextMilestone(config({ milestone_20_triggered: true, milestone_10_triggered: true, milestone_5_triggered: true }), 100), 0);
  assert.equal(nextMilestone(config({ milestone_20_triggered: true, milestone_10_triggered: true, milestone_5_triggered: true }), 101), null);
});

test('triggered milestones are not returned again', () => {
  const state = config({ milestone_20_triggered: true, milestone_10_triggered: true, milestone_5_triggered: true, target_triggered: true });
  assert.equal(nextMilestone(state, 150), null);
});

test('role counting uses current guild members and excludes bots', async () => {
  const members = [
    { user: { bot: false }, roles: { cache: new Map([['role', true]]) } },
    { user: { bot: false }, roles: { cache: new Map() } },
    { user: { bot: true }, roles: { cache: new Map([['role', true]]) } },
  ];
  const guild = {
    roles: { cache: new Map([['role', { id: 'role', name: 'Verified' }]]), fetch: async () => null },
    members: {
      cache: { filter: (callback) => ({ size: members.filter(callback).length }), get: () => null },
      fetch: async () => null,
    },
  };
  const result = await countRoleMembers(guild, 'role');
  assert.equal(result.count, 1);
});

test('notification text includes role progress and target distance', () => {
  assert.match(notificationText(config(), 'Verified Holder', 95, 5), /Only 5 more holders/);
  assert.match(notificationText(config(), 'Verified Holder', 100, 0), /Target reached/);
});

test('guildMemberAdd handler evaluates configured notifications for that guild', async () => {
  const originalListEnabled = notificationRepository.listEnabled;
  const originalMarkTriggered = notificationRepository.markTriggered;
  const sent = [];
  const marked = [];
  notificationRepository.listEnabled = (guildId) => guildId === 'guild'
    ? [config({ guild_id: 'guild', role_id: 'role', channel_id: 'channel' })]
    : [];
  notificationRepository.markTriggered = (guildId, id, milestone) => marked.push({ guildId, id, milestone });
  const members = Array.from({ length: 80 }, () => ({ user: { bot: false }, roles: { cache: new Map([['role', true]]) } }));
  const guild = {
    id: 'guild',
    roles: { cache: new Map([['role', { id: 'role', name: 'Verified' }]]), fetch: async () => null },
    channels: { cache: new Map([['channel', { send: async (payload) => sent.push(payload) }]]) },
    members: {
      cache: { filter: (callback) => ({ size: members.filter(callback).length }) },
      fetch: async () => null,
    },
  };
  const client = { guilds: { cache: new Map([['guild', guild]]), fetch: async () => null }, channels: { fetch: async () => null } };

  try {
    await handleGuildMemberAdd(client, { guild });
  } finally {
    notificationRepository.listEnabled = originalListEnabled;
    notificationRepository.markTriggered = originalMarkTriggered;
  }

  assert.equal(sent.length, 1);
  assert.deepEqual(marked, [{ guildId: 'guild', id: 1, milestone: 20 }]);
});

test('only guildMemberAdd is wired as the automatic notification trigger', () => {
  const indexSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
  assert.match(indexSource, /Events\.GuildMemberAdd/);
  assert.doesNotMatch(indexSource, /Events\.GuildMemberUpdate/);
  assert.doesNotMatch(indexSource, /Events\.GuildMemberRemove/);
  assert.doesNotMatch(indexSource, /setInterval|setTimeout/);
  assert.doesNotMatch(indexSource, /evaluateAllNotifications/);
});

test('notifytest does not mutate notification milestone state', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'commands', 'notifytest.js'), 'utf8');
  assert.doesNotMatch(source, /markTriggered|reset\(|replaceFlags|setEnabled|delete\(/);
});

test('rolecount stays independent of notification configuration', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'commands', 'rolecount.js'), 'utf8');
  assert.doesNotMatch(source, /notificationRepository|role_notifications|notify/);
  assert.match(source, /countRoleMembers/);
});
