const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const sessionManager = require('../embed-builder/sessionManager');
const { renderBuilder, toEmbed, toButtonRows } = require('../embed-builder/renderer');
const templateRepository = require('../database/repositories/templateRepository');
const managedMessageRepository = require('../database/repositories/managedMessageRepository');
const { assertCanManageEmbeds } = require('../services/permissionService');
const { createDuplicate, normalizeName, saveTemplate } = require('../services/embedService');
const { sendConfiguration } = require('../services/messageService');
const { assertValidConfiguration } = require('../embed-builder/validators');
const { filesForConfiguration } = require('../services/mediaAssetService');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function replyPayload(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    const { ephemeral, ...editablePayload } = payload;
    return interaction.editReply(editablePayload);
  }
  return interaction.reply(payload);
}

async function deferForFiles(interaction, payload) {
  if (payload.files?.length && !interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }
}

async function create(interaction) {
  const name = interaction.options.getString('name') || '';
  const session = sessionManager.create({ guildId: interaction.guildId, userId: interaction.user.id, templateName: name ? normalizeName(name) : '' });
  const payload = renderBuilder(session);
  await deferForFiles(interaction, payload);
  await replyPayload(interaction, payload);
}

async function editTemplate(interaction) {
  const name = normalizeName(interaction.options.getString('name', true));
  const template = templateRepository.findByName(interaction.guildId, name);
  if (!template) throw new Error(`Template "${name}" was not found.`);
  assertValidConfiguration(template.configuration);
  const session = sessionManager.create({
    guildId: interaction.guildId,
    userId: interaction.user.id,
    templateName: template.name,
    configuration: clone(template.configuration),
    mode: 'template',
    saved: true,
  });
  const payload = renderBuilder(session);
  await deferForFiles(interaction, payload);
  await replyPayload(interaction, payload);
}

async function editMessage(interaction) {
  const messageId = interaction.options.getString('message_id', true);
  if (!/^\d{17,20}$/.test(messageId)) throw new Error('Enter a valid Discord message ID.');
  const managed = managedMessageRepository.findByMessage(interaction.guildId, messageId);
  if (!managed) throw new Error('That message is not tracked as a managed message created by this bot.');
  assertValidConfiguration(managed.configuration);
  const session = sessionManager.create({
    guildId: interaction.guildId,
    userId: interaction.user.id,
    templateName: '',
    configuration: clone(managed.configuration),
    mode: 'managed-message',
    managedMessageId: managed.id,
    managedMessageUpdatedAt: managed.updated_at,
  });
  session.transition('settings');
  const payload = renderBuilder(session);
  await deferForFiles(interaction, payload);
  await replyPayload(interaction, payload);
}

async function save(interaction) {
  const session = sessionManager.latest(interaction.guildId, interaction.user.id);
  if (!session) throw new Error('No active builder session was found. Use /embed create first.');
  const saved = saveTemplate({
    guildId: interaction.guildId,
    name: interaction.options.getString('name', true),
    configuration: session.configuration,
    userId: interaction.user.id,
  });
  session.templateName = saved.name;
  session.saved = true;
  await interaction.reply({ content: `Saved template "${saved.name}".`, ephemeral: true });
}

async function list(interaction) {
  const names = templateRepository.listNames(interaction.guildId);
  const content = names.length
    ? `Saved embeds:\n${names.map((name) => `- ${name}`).join('\n')}`
    : 'No templates saved yet.';
  await interaction.reply({ content, ephemeral: true });
}

async function preview(interaction) {
  const name = normalizeName(interaction.options.getString('name', true));
  const template = templateRepository.findByName(interaction.guildId, name);
  if (!template) throw new Error(`Template "${name}" was not found.`);
  assertValidConfiguration(template.configuration);
  const payload = {
    content: `Preview: ${template.name}`,
    embeds: [toEmbed(template.configuration)],
    components: toButtonRows(template.configuration),
    files: filesForConfiguration(template.configuration),
    ephemeral: true,
  };
  await deferForFiles(interaction, payload);
  await replyPayload(interaction, payload);
}

async function send(interaction) {
  const name = normalizeName(interaction.options.getString('name', true));
  const channel = interaction.options.getChannel('channel', true);
  const template = templateRepository.findByName(interaction.guildId, name);
  if (!template) throw new Error(`Template "${name}" was not found.`);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const record = await sendConfiguration({
    guild: interaction.guild,
    channel,
    clientUser: interaction.client.user,
    configuration: template.configuration,
    templateName: template.name,
  });
  await interaction.editReply({ content: `Sent "${name}" to #${channel.name}. Managed message ID: ${record.message_id}` });
}

async function deleteTemplate(interaction) {
  const name = normalizeName(interaction.options.getString('name', true));
  const template = templateRepository.findMetadataByName(interaction.guildId, name);
  if (!template) throw new Error(`Template "${name}" was not found.`);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`template_delete_confirm:${template.id}`).setLabel('Delete').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('template_delete_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
  );
  await interaction.reply({ content: `Delete template "${name}"? This cannot be undone.`, components: [row], ephemeral: true });
}

async function duplicate(interaction) {
  const duplicated = createDuplicate({
    guildId: interaction.guildId,
    fromName: interaction.options.getString('from', true),
    toName: interaction.options.getString('to', true),
    userId: interaction.user.id,
  });
  await interaction.reply({ content: `Created duplicate template "${duplicated.name}".`, ephemeral: true });
}

async function info(interaction) {
  const name = interaction.options.getString('name');
  const messageId = interaction.options.getString('message_id');
  if (name) {
    const template = templateRepository.findByName(interaction.guildId, normalizeName(name));
    if (!template) throw new Error(`Template "${name}" was not found.`);
    assertValidConfiguration(template.configuration);
    await interaction.reply({
      content: [
        `Template: ${template.name}`,
        `Fields: ${template.configuration.embed.fields.length}`,
        `Buttons: ${template.configuration.buttons.length}`,
        `Created: ${template.created_at}`,
        `Updated: ${template.updated_at}`,
      ].join('\n'),
      ephemeral: true,
    });
    return;
  }
  if (messageId) {
    const managed = managedMessageRepository.findByMessage(interaction.guildId, messageId);
    if (!managed) throw new Error('That managed message was not found.');
    assertValidConfiguration(managed.configuration);
    await interaction.reply({
      content: [
        `Managed message: ${managed.message_id}`,
        `Channel ID: ${managed.channel_id}`,
        `Template ID: ${managed.template_id || 'none'}`,
        `Created: ${managed.created_at}`,
        `Updated: ${managed.updated_at}`,
      ].join('\n'),
      ephemeral: true,
    });
    return;
  }
  await interaction.reply({ content: 'Provide either a template name or a managed message ID.', ephemeral: true });
}

function normalizeSubcommandName(subcommand) {
  return typeof subcommand === 'string' ? subcommand.trim().toLowerCase().replace(/_/g, '-') : subcommand;
}

async function execute(interaction) {
  assertCanManageEmbeds(interaction);
  const rawSubcommand = interaction.options.getSubcommand();
  const subcommand = normalizeSubcommandName(rawSubcommand);
  const handlers = {
    create,
    'edit-template': editTemplate,
    'edit-message': editMessage,
    save,
    list,
    preview,
    send,
    delete: deleteTemplate,
    duplicate,
    info,
  };

  const handler = handlers[subcommand] || handlers[rawSubcommand] || handlers[subcommand?.replace(/-/g, '_')];
  if (typeof handler !== 'function') {
    throw new Error(`Unsupported embed subcommand: ${rawSubcommand}`);
  }

  await handler(interaction);
}

module.exports = { execute };
