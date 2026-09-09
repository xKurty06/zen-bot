const test = require('node:test');
const assert = require('node:assert/strict');
const { BuilderSession, emptyConfiguration } = require('../src/embed-builder/BuilderSession');
const { renderBuilder, validateComponentTree } = require('../src/embed-builder/renderer');
const { normalizeName } = require('../src/services/embedService');
const { validateConfiguration } = require('../src/embed-builder/validators');
const { SessionManager } = require('../src/embed-builder/sessionManager');
const { parseCustomId } = require('../src/interactions');
const { handleButton } = require('../src/interactions');
const { id } = require('../src/embed-builder/renderer');

function ids(payload) {
  return payload.components.flatMap((row) => row.toJSON().components)
    .map((component) => component.custom_id)
    .filter(Boolean);
}

test('every builder view has unique component IDs and stays within Discord action-row limits', () => {
  const session = new BuilderSession({ guildId: 'guild', userId: 'user' });
  for (const section of ['home', 'content', 'appearance', 'media', 'fields', 'buttons', 'settings', 'choose_channel_button', 'choose_send_channel']) {
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

test('session lookup never falls back when a stale component provides a session ID', () => {
  const manager = new SessionManager();
  const active = manager.create({ guildId: 'guild', userId: 'user' });
  assert.equal(manager.get('guild', 'user', 'missing-session'), null);
  assert.equal(manager.get('guild', 'user', active.id), active);
  const parsed = parseCustomId(`eb:${active.id}:0:button:section:content`);
  assert.equal(parsed.sessionId, active.id);
  assert.equal(parsed.revision, 0);
});

test('media and icon editors expose Discord file-upload components in their modals', async () => {
  const session = new BuilderSession({ guildId: 'guild', userId: 'user' });
  const shown = [];
  const interaction = {
    guildId: 'guild',
    user: { id: 'user' },
    customId: id(session, 'button', 'modal_thumbnail'),
    showModal: async (modal) => shown.push(modal.toJSON()),
  };
  const manager = require('../src/embed-builder/sessionManager');
  manager.sessions?.clear?.();
  manager.sessions?.set?.(manager.key(session.guildId, session.userId, session.id), session);
  await handleButton(interaction);
  const components = shown[0].components.flatMap((row) => row.components);
  assert.ok(components.some((component) => component.type === 19));
});
