const test = require('node:test');
const assert = require('node:assert/strict');
const {
  differentOverwriteTargets,
  childrenForCategory,
  execute,
  formatCategory,
  splitLinesIntoDescriptions,
} = require('../src/commands/checksync');
const { Collection, ChannelType } = require('discord.js');
const { canCheckPermissionSync: canCheck } = require('../src/services/permissionService');
const { PermissionsBitField } = require('discord.js');

function overwrites(entries) {
  return {
    cache: new Map(entries.map((entry) => [entry.id, {
      ...entry,
      allow: { bitfield: BigInt(entry.allow || 0) },
      deny: { bitfield: BigInt(entry.deny || 0) },
    }])),
  };
}

test('permission sync comparison ignores overwrite ordering', () => {
  const category = overwrites([
    { id: 'role-a', type: 0, allow: 1, deny: 2 },
    { id: 'user-a', type: 1, allow: 4, deny: 8 },
  ]);
  const channel = overwrites([
    { id: 'user-a', type: 1, allow: 4, deny: 8 },
    { id: 'role-a', type: 0, allow: 1, deny: 2 },
  ]);
  assert.deepEqual(differentOverwriteTargets(category, channel), []);
});

test('permission sync comparison reports added, removed, and changed role or user overwrites', () => {
  const category = overwrites([
    { id: 'role-a', type: 0, allow: 1, deny: 0 },
    { id: 'user-a', type: 1, allow: 4, deny: 0 },
  ]);
  const channel = overwrites([
    { id: 'role-a', type: 0, allow: 1, deny: 2 },
    { id: 'role-b', type: 0, allow: 8, deny: 0 },
  ]);
  assert.deepEqual(
    differentOverwriteTargets(category, channel).map((overwrite) => `${overwrite.type}:${overwrite.id}`).sort(),
    ['0:role-a', '0:role-b', '1:user-a'],
  );
});

test('category results include the targets whose overwrites differ', () => {
  const category = { id: 'category', name: 'Community', permissionOverwrites: overwrites([{ id: 'role-a', type: 0, allow: 1 }]) };
  const channel = { name: 'chat', permissionOverwrites: overwrites([{ id: 'role-a', type: 0, allow: 2 }]) };
  const guild = { id: 'guild', roles: { cache: new Map([['role-a', { name: 'Verified' }]]) }, members: { cache: new Map() } };
  const result = formatCategory(category, [channel], guild);
  assert.equal(result.notSynced, 1);
  assert.match(result.lines.join('\n'), /Different: Verified/);
});

test('empty categories are represented without creating sync candidates', () => {
  const result = formatCategory({ name: 'Empty', permissionOverwrites: overwrites([]) }, [], { id: 'guild' });
  assert.deepEqual(result, { lines: ['📁 Empty', '   No channels'], synced: 0, notSynced: 0 });
});

test('execute handles Discord.js collections as channel values, not map entries', async () => {
  const channels = new Collection([
    ['category-id', { id: 'category-id', name: 'Community', type: ChannelType.GuildCategory, rawPosition: 0, permissionOverwrites: overwrites([]) }],
    ['channel-id', { id: 'channel-id', name: 'chat', type: ChannelType.GuildText, parentId: 'category-id', rawPosition: 1, permissionOverwrites: overwrites([]) }],
    ['orphan-id', { id: 'orphan-id', name: 'orphan', type: ChannelType.GuildText, rawPosition: 2, permissionOverwrites: overwrites([]) }],
  ]);
  const replies = [];
  await execute({
    inGuild: () => true,
    memberPermissions: { has: (permission) => permission === PermissionsBitField.Flags.ManageChannels },
    guildId: 'guild',
    guild: {
      id: 'guild',
      channels: { fetch: async () => channels },
      roles: { cache: new Map() },
      members: { cache: new Map() },
    },
    deferReply: async () => {},
    editReply: async (payload) => replies.push(payload),
    followUp: async (payload) => replies.push(payload),
  });
  assert.match(replies[1].embeds[0].data.description, /Community/);
  assert.doesNotMatch(replies[1].embeds[0].data.description, /undefined/);
});

test('category child cache is used when a fetched channel lacks parentId', () => {
  const channel = { id: 'channel-id', name: 'chat', type: ChannelType.GuildText, rawPosition: 1, permissionOverwrites: overwrites([]) };
  const category = {
    id: 'category-id',
    children: { cache: new Collection([['channel-id', channel]]) },
  };
  assert.deepEqual(childrenForCategory(category, []), [channel]);
});

test('result descriptions stay within the configured embed limit', () => {
  const descriptions = splitLinesIntoDescriptions(['a'.repeat(30), 'b'.repeat(30), 'c'.repeat(80)], 64);
  assert.ok(descriptions.every((description) => description.length <= 64));
  assert.equal(descriptions.join('').replace(/\n/g, ''), `${'a'.repeat(30)}${'b'.repeat(30)}${'c'.repeat(80)}`);
});

test('permission sync is limited to members who can manage relevant guild configuration', () => {
  const allowed = new Set([PermissionsBitField.Flags.ManageChannels]);
  const interaction = { inGuild: () => true, memberPermissions: { has: (permission) => allowed.has(permission) } };
  assert.equal(canCheck(interaction), true);
  assert.equal(canCheck({ inGuild: () => true, memberPermissions: { has: () => false } }), false);
});
