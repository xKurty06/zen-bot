const test = require('node:test');
const assert = require('node:assert/strict');
const { Collection, ChannelType, PermissionsBitField } = require('discord.js');
const {
  differentOverwriteTargets, differentPermissions, overwriteDifferences, childrenForCategory,
  execute, formatCategory, splitLinesIntoDescriptions,
} = require('../src/commands/checksync');
const { canCheckPermissionSync: canCheck } = require('../src/services/permissionService');

function overwrites(entries) {
  return { cache: new Map(entries.map((entry) => [entry.id, { ...entry, allow: { bitfield: BigInt(entry.allow || 0) }, deny: { bitfield: BigInt(entry.deny || 0) } }])) };
}

test('permission sync comparison ignores overwrite ordering', () => {
  const category = overwrites([{ id: 'role-a', type: 0, allow: 1, deny: 2 }, { id: 'user-a', type: 1, allow: 4, deny: 8 }]);
  const channel = overwrites([{ id: 'user-a', type: 1, allow: 4, deny: 8 }, { id: 'role-a', type: 0, allow: 1, deny: 2 }]);
  assert.deepEqual(differentOverwriteTargets(category, channel), []);
});

test('permission sync comparison reports added, removed, and changed targets', () => {
  const category = overwrites([{ id: 'role-a', type: 0, allow: 1 }, { id: 'user-a', type: 1, allow: 4 }]);
  const channel = overwrites([{ id: 'role-a', type: 0, allow: 1, deny: 2 }, { id: 'role-b', type: 0, allow: 8 }]);
  assert.deepEqual(differentOverwriteTargets(category, channel).map((overwrite) => `${overwrite.type}:${overwrite.id}`).sort(), ['0:role-a', '0:role-b', '1:user-a']);
});

test('category results include only the permissions that differ', () => {
  const category = { id: 'category', name: 'Community', permissionOverwrites: overwrites([{ id: 'role-a', type: 0, allow: 1 }]) };
  const channel = { name: 'chat', permissionOverwrites: overwrites([{ id: 'role-a', type: 0, allow: 2 }]) };
  const guild = { id: 'guild', roles: { cache: new Map([['role-a', { name: 'Verified' }]]) }, members: { cache: new Map() } };
  const result = formatCategory(category, [channel], guild);
  assert.equal(result.notSynced, 1);
  assert.match(result.lines.join('\n'), /<@&role-a>/);
  assert.match(result.lines.join('\n'), /<:red_tick:1547706186386645012> #chat — NOT SYNCED/);
  assert.match(result.lines.join('\n'), /Create Instant Invite/);
  assert.match(result.lines.join('\n'), /Category <:bb_dot3:1547710157524303995> \| Channel <:bb_dot2:1547710239648911371>/);
});

test('permission differences show absent overwrites as Not Set', () => {
  const differences = differentPermissions({ id: 'role-a', type: '0', allow: 1n, deny: 0n }, undefined);
  assert.deepEqual(differences.find((difference) => difference.name === 'Create Instant Invite'), { name: 'Create Instant Invite', category: 'Allow', channel: 'Not Set' });
});

test('overwrite differences omit matching permissions for changed targets', () => {
  const category = { permissionOverwrites: overwrites([{ id: 'role-a', type: 0, allow: 3 }]) };
  const channel = { permissionOverwrites: overwrites([{ id: 'role-a', type: 0, allow: 1, deny: 2 }]) };
  const guild = { id: 'guild', roles: { cache: new Map([['role-a', { name: 'Verified' }]]) }, members: { cache: new Map() } };
  assert.deepEqual(overwriteDifferences(category, channel, guild)[0].permissions, [{ name: 'Kick Members', category: 'Allow', channel: 'Deny' }]);
});

test('channel entries include spacing between adjacent results', () => {
  const category = { name: 'Community', permissionOverwrites: overwrites([]) };
  const synced = { name: 'general', permissionOverwrites: overwrites([]) };
  const unsynced = { name: 'staff', permissionOverwrites: overwrites([{ id: 'role-a', type: 0, allow: 1 }]) };
  const guild = { id: 'guild', roles: { cache: new Map([['role-a', { name: 'Verified' }]]) }, members: { cache: new Map() } };
  const result = formatCategory(category, [synced, unsynced], guild);
  assert.match(result.lines.join('\n'), /#general — SYNCED\n\n<:red_tick:1547706186386645012> #staff — NOT SYNCED/);
  assert.doesNotMatch(result.lines.join('\n'), /#general — SYNCED\n\n\n<:red_tick:1547706186386645012> #staff — NOT SYNCED/);
});

test('empty categories are represented without creating sync candidates', () => {
  const result = formatCategory({ name: 'Empty', permissionOverwrites: overwrites([]) }, [], { id: 'guild' });
  assert.deepEqual(result, { lines: ['📁 Category: Empty', '', 'No channels in this category.'], synced: 0, notSynced: 0 });
});

test('execute presents a category selector instead of multiple reports', async () => {
  const channels = new Collection([
    ['category-id', { id: 'category-id', name: 'Community', type: ChannelType.GuildCategory, rawPosition: 0, permissionOverwrites: overwrites([]) }],
    ['channel-id', { id: 'channel-id', name: 'chat', type: ChannelType.GuildText, parentId: 'category-id', rawPosition: 1, permissionOverwrites: overwrites([]) }],
  ]);
  const replies = [];
  await execute({ inGuild: () => true, memberPermissions: { has: (permission) => permission === PermissionsBitField.Flags.ManageChannels }, guildId: 'guild', guild: { id: 'guild', channels: { fetch: async () => channels }, roles: { cache: new Map() }, members: { cache: new Map() } }, deferReply: async () => {}, editReply: async (payload) => replies.push(payload) });
  assert.equal(replies.length, 1);
  assert.match(replies[0].embeds[0].data.description, /Select a category/);
  assert.equal(replies[0].components[0].components[0].options[0].data.value, 'category-id');
});

test('category child cache is used when a fetched channel lacks parentId', () => {
  const channel = { id: 'channel-id', name: 'chat', type: ChannelType.GuildText, rawPosition: 1, permissionOverwrites: overwrites([]) };
  assert.deepEqual(childrenForCategory({ id: 'category-id', children: { cache: new Collection([['channel-id', channel]]) } }, []), [channel]);
});

test('result descriptions stay within the configured embed limit', () => {
  const descriptions = splitLinesIntoDescriptions(['a'.repeat(30), 'b'.repeat(30), 'c'.repeat(80)], 64);
  assert.ok(descriptions.every((description) => description.length <= 64));
  assert.equal(descriptions.join('').replace(/\n/g, ''), `${'a'.repeat(30)}${'b'.repeat(30)}${'c'.repeat(80)}`);
});

test('permission sync is limited to members who can manage relevant guild configuration', () => {
  const allowed = new Set([PermissionsBitField.Flags.ManageChannels]);
  assert.equal(canCheck({ inGuild: () => true, memberPermissions: { has: (permission) => allowed.has(permission) } }), true);
  assert.equal(canCheck({ inGuild: () => true, memberPermissions: { has: () => false } }), false);
});
