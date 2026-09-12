const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const notificationRepository = require('../src/database/repositories/notificationRepository');
const {
  countRoleMembers,
  enforceJoinedMemberRoleLimits,
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
    await handleGuildMemberAdd(client, { guild }, { delayMs: 0 });
  } finally {
    notificationRepository.listEnabled = originalListEnabled;
    notificationRepository.markTriggered = originalMarkTriggered;
  }

  assert.equal(sent.length, 1);
  assert.deepEqual(marked, [{ guildId: 'guild', id: 1, milestone: 20 }]);
});

test('joined member role limit enforcement removes the monitored role only from the joining member', async () => {
  const originalListEnabled = notificationRepository.listEnabled;
  const sent = [];
  const logSent = [];
  const joinedRoles = new Map([['role', true]]);
  const joinedMember = {
    id: 'new-member',
    user: { bot: false },
    guild: null,
    roles: {
      cache: joinedRoles,
      remove: async (role) => {
        joinedRoles.delete(role.id);
      },
    },
  };
  const members = [
    ...Array.from({ length: 100 }, (_, index) => ({
      id: `member-${index}`,
      user: { bot: false },
      roles: { cache: new Map([['role', true]]) },
    })),
    joinedMember,
  ];
  const guild = {
    id: 'guild',
    roles: { cache: new Map([['role', { id: 'role', name: 'Verified' }]]), fetch: async () => null },
    channels: {
      cache: new Map([
        ['channel', { send: async (payload) => sent.push(payload) }],
        ['1544608877616562256', { send: async (payload) => logSent.push(payload) }],
      ]),
    },
    members: {
      cache: { filter: (callback) => ({ size: members.filter(callback).length }) },
      fetch: async (id) => (id === joinedMember.id ? joinedMember : null),
    },
  };
  joinedMember.guild = guild;
  const client = { channels: { fetch: async () => null } };
  notificationRepository.listEnabled = (guildId) => guildId === 'guild'
    ? [config({ guild_id: 'guild', role_id: 'role', channel_id: 'channel' })]
    : [];

  try {
    const removals = await enforceJoinedMemberRoleLimits(client, joinedMember);
    assert.deepEqual(removals, [{ configId: 1, roleId: 'role', beforeCount: 101, afterCount: 100 }]);
  } finally {
    notificationRepository.listEnabled = originalListEnabled;
  }

  assert.equal(joinedRoles.has('role'), false);
  assert.equal(sent.length, 1);
  assert.match(sent[0].content, /Count: 101 -> 100\/100/);
  assert.equal(logSent.length, 1);
  assert.equal(logSent[0].embeds[0].data.title, 'Monitored Role Removed');
  assert.deepEqual(logSent[0].allowedMentions, { parse: [] });
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
