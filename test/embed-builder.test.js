const test = require('node:test');
const assert = require('node:assert/strict');
const { BuilderSession, emptyConfiguration } = require('../src/embed-builder/BuilderSession');
const { renderBuilder, toEmbed, toMessagePayload, validateComponentTree } = require('../src/embed-builder/renderer');
const { normalizeName } = require('../src/services/embedService');
const { validateConfiguration } = require('../src/embed-builder/validators');
const { SessionManager } = require('../src/embed-builder/sessionManager');
const { parseCustomId } = require('../src/interactions');
const { handleButton, handleModalSubmit, showBuilder } = require('../src/interactions');
const { id } = require('../src/embed-builder/renderer');
const { canManageEmbeds } = require('../src/services/permissionService');
const { formatUptime } = require('../src/commands/uptime');

function ids(payload) {
  return payload.components.flatMap((row) => row.toJSON().components)
    .map((component) => component.custom_id)
    .filter(Boolean);
}

test('embed manager role may use embed commands without guild management permissions', () => {
  const interaction = {
    inGuild: () => true,
    memberPermissions: { has: () => false },
    member: { roles: { cache: new Map([['1544590813579714600', true]]) } },
  };

  assert.equal(canManageEmbeds(interaction), true);
});

test('every builder view has unique component IDs and stays within Discord action-row limits', () => {
  const session = new BuilderSession({ guildId: 'guild', userId: 'user' });
  for (const section of ['home', 'content', 'embed_content', 'appearance', 'media', 'fields', 'buttons', 'settings', 'choose_channel_button', 'choose_send_channel']) {
    session.section = section;
    const payload = renderBuilder(session);
    assert.ok(payload.components.length <= 5, `${section} has too many rows`);
    const componentIds = ids(payload);
    assert.equal(new Set(componentIds).size, componentIds.length, `${section} has duplicate IDs`);
  }
});

test('subsections use Back and channel picker controls do not collide', () => {
  const session = new BuilderSession({ guildId: 'guild', userId: 'user' });
  session.section = 'buttons';
  const buttons = renderBuilder(session).components[0].toJSON().components;
  assert.ok(buttons.some((button) => button.label === 'Back'));
  session.section = 'choose_channel_button';
  const payload = renderBuilder(session);
  const controls = ids(payload);
  assert.equal(new Set(controls).size, controls.length);
});

test('template names normalize consistently and reject invalid/overlong names', () => {
  assert.equal(normalizeName(' My---Template '), 'my-template');
  assert.equal(normalizeName('my_template'), 'my_template');
  assert.throws(() => normalizeName('***'));
  assert.throws(() => normalizeName('a'.repeat(65)));
});

test('configuration validation rejects malformed fields, insecure button URLs, and excessive buttons', () => {
  const configuration = emptyConfiguration();
  configuration.embed.title = 'Example';
  configuration.embed.fields = [{ name: '', value: '' }];
  configuration.buttons = [{ label: 'Open', url: 'http://example.com' }];
  assert.match(validateConfiguration(configuration).join('\n'), /needs a name|must use https/);
  configuration.buttons[0].emoji = '<bad>';
  assert.match(validateConfiguration(configuration).join('\n'), /emoji is malformed/);
  assert.throws(() => validateComponentTree(new Array(6).fill({ components: [{}] })));
});

test('message content is separate from embed description and controls allowed mentions', () => {
  const configuration = emptyConfiguration();
  configuration.content = 'Hello <@123456789012345678> <@&223456789012345678> <#323456789012345678> @everyone';
  configuration.embed.description = 'Embed body';
  const payload = toMessagePayload(configuration);
  assert.equal(payload.content, 'Hello <@123456789012345678> <@&223456789012345678> <#323456789012345678> @\u200beveryone');
  assert.equal(payload.embeds[0].toJSON().description, 'Embed body');
  assert.deepEqual(payload.allowedMentions, { parse: [], users: ['123456789012345678'], roles: ['223456789012345678'] });
});

test('message-only configurations validate without requiring embed content', () => {
  const configuration = emptyConfiguration();
  configuration.content = 'Plain **markdown** message';
  assert.deepEqual(validateConfiguration(configuration), []);
  assert.equal(toMessagePayload(configuration).embeds.length, 0);
  configuration.content = 'x'.repeat(2001);
  assert.match(validateConfiguration(configuration).join('\n'), /Message content is too long/);
});

test('session lookup never falls back when a stale component provides a session ID', () => {
  const manager = new SessionManager();
  const active = manager.create({ guildId: 'guild', userId: 'user' });
  assert.equal(manager.get('guild', 'user', 'missing-session'), null);
  assert.equal(manager.get('guild', 'user', active.id), active);
  const parsed = parseCustomId(`eb:${active.id}:0:button:section:content`);
  assert.equal(parsed.sessionId, active.id);
  assert.equal(parsed.revision, 0);
});

test('stale builder buttons refresh instead of returning an interaction error', async () => {
  const session = new BuilderSession({ guildId: 'guild', userId: 'user' });
  session.changed();
  const manager = require('../src/embed-builder/sessionManager');
  manager.sessions?.clear?.();
  manager.sessions?.set?.(manager.key(session.guildId, session.userId, session.id), session);
  const updates = [];

  await handleButton({
    guildId: 'guild',
    user: { id: 'user' },
    customId: id(session, 'button', 'section', 'media').replace(`:${session.revision}:`, ':0:'),
    update: async (payload) => updates.push(payload),
  });

  assert.match(updates[0].content, /^This builder was refreshed\./);
  assert.equal(session.section, 'home');
});

test('expired builder buttons receive a direct ephemeral response', async () => {
  const session = new BuilderSession({ guildId: 'guild', userId: 'user' });
  const replies = [];
  await handleButton({
    guildId: 'guild',
    user: { id: 'user' },
    customId: id(session, 'button', 'remove_thumbnail'),
    reply: async (payload) => replies.push(payload),
  });
  assert.match(replies[0].content, /session has expired/);
  assert.ok(replies[0].flags);
});

test('cancel explicitly clears uploaded message attachments', async () => {
  const session = new BuilderSession({ guildId: 'guild', userId: 'user' });
  const manager = require('../src/embed-builder/sessionManager');
  manager.sessions?.clear?.();
  manager.sessions?.set?.(manager.key(session.guildId, session.userId, session.id), session);
  const updates = [];
  await handleButton({
    guildId: 'guild',
    user: { id: 'user' },
    customId: id(session, 'button', 'cancel'),
    update: async (payload) => updates.push(payload),
  });
  assert.deepEqual(updates[0].attachments, []);
});

test('uptime formatter converts milliseconds into a readable duration', () => {
  assert.equal(formatUptime((2 * 24 * 60 * 60 + 3 * 60 * 60 + 5 * 60 + 9) * 1000), '2d 3h 5m 9s');
  assert.equal(formatUptime(5000), '5s');
  assert.equal(formatUptime(3600000), '1h');
});

test('media and icon editors expose optional Discord file-upload components in their modals', async () => {
  const session = new BuilderSession({ guildId: 'guild', userId: 'user' });
  const manager = require('../src/embed-builder/sessionManager');
  manager.sessions?.clear?.();
  manager.sessions?.set?.(manager.key(session.guildId, session.userId, session.id), session);

  for (const action of ['modal_thumbnail', 'modal_image', 'modal_author', 'modal_footer']) {
    const shown = [];
    await handleButton({
      guildId: 'guild',
      user: { id: 'user' },
      customId: id(session, 'button', action),
      showModal: async (modal) => shown.push(modal.toJSON()),
    });
    const uploads = shown[0].components
      .map((component) => component.component)
      .filter((component) => component?.type === 19);
    assert.equal(uploads.length, 1, `${action} should include one upload control`);
    assert.equal(uploads[0].required, false, `${action} upload should be optional`);
    assert.equal(uploads[0].min_values, 0, `${action} upload should permit no file`);
  }
});

test('attachment-backed uploaded images remain valid embed media', () => {
  const session = new BuilderSession({ guildId: 'guild', userId: 'user' });
  session.configuration.embed.image = 'attachment://d2719cbe-d3a8-4966-a9c9-320ddd398d28.png';
  session.configuration.mediaAssets = {
    'd2719cbe-d3a8-4966-a9c9-320ddd398d28.png': 'https://cdn.discordapp.com/attachments/1/2/banner.png?sig=abc',
  };
  assert.equal(validateConfiguration(session.configuration).length, 0);
  assert.equal(toEmbed(session.configuration).toJSON().image.url, session.configuration.embed.image);
});

test('Discord-backed builder updates defer before reattaching media', async () => {
  const filename = '11111111-1111-4111-8111-111111111111.png';
  const session = new BuilderSession({ guildId: 'guild', userId: 'user' });
  session.configuration.embed.image = `attachment://${filename}`;
  session.configuration.mediaAssets = { [filename]: 'https://cdn.discordapp.com/attachments/1/2/banner.png?sig=abc' };
  session.mediaDirty = true;
  const calls = [];
  const interaction = {
    deferred: false,
    replied: false,
    deferUpdate: async () => { interaction.deferred = true; calls.push('defer'); },
    editReply: async (payload) => calls.push(payload),
    update: async () => { throw new Error('update should not be used for file-backed payloads'); },
  };

  await showBuilder(interaction, session);
  assert.equal(calls[0], 'defer');
  assert.equal(calls[1].files.length, 1);
  await showBuilder({
    deferred: false,
    replied: false,
    update: async (payload) => calls.push(payload),
  }, session);
  assert.equal(calls[2].files, undefined);
});

test('modal uploads retain Discord URLs without creating local files', async () => {
  const session = new BuilderSession({ guildId: 'guild', userId: 'user' });
  const calls = [];
  const interaction = {
    fields: {
      getTextInputValue: () => '',
      getUploadedFiles: () => ({ first: () => ({
        contentType: 'image/png',
        size: 1024,
        url: 'https://cdn.discordapp.com/attachments/1/2/banner.png?sig=abc',
      }) }),
    },
    deferUpdate: async () => { interaction.deferred = true; calls.push('defer'); },
    editReply: async (payload) => calls.push(payload),
    deferred: false,
    user: { id: 'user' },
    guildId: 'guild',
  };

  await handleModalSubmit(interaction, session, 'submit_modal_image', '');
  assert.equal(calls[0], 'defer');
  assert.match(session.configuration.embed.image, /^attachment:\/\//);
  assert.equal(Object.keys(session.configuration.mediaAssets).length, 1);
  assert.equal(calls[1].files.length, 1);
});

test('save modal does not look for a nonexistent upload field', async () => {
  const session = new BuilderSession({ guildId: 'guild', userId: 'user' });
  session.configuration.embed.title = 'Welcome';
  const calls = [];
  await handleModalSubmit({
    guildId: 'guild',
    user: { id: 'user' },
    fields: {
      getTextInputValue: () => 'welcome-banner',
      getUploadedFiles: () => { throw new Error('save modal should not query upload fields'); },
    },
    update: async (payload) => calls.push(payload),
  }, session, 'submit_modal_save', '');
  assert.equal(session.templateName, 'welcome-banner');
  assert.equal(calls.length, 1);
});
