const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  FileUploadBuilder,
  LabelBuilder,
  MessageFlags,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const crypto = require('node:crypto');
const sessionManager = require('./embed-builder/sessionManager');
const { id, renderBuilder, toEmbed, toButtonRows, validateComponentTree } = require('./embed-builder/renderer');
const { parseColor, parseUrl, booleanFromInput } = require('./utils/validation');
const { channelUrl } = require('./utils/discordUrls');
const { saveTemplate } = require('./services/embedService');
const { sendConfiguration, updateManagedMessage } = require('./services/messageService');
const managedMessageRepository = require('./database/repositories/managedMessageRepository');
const logger = require('./utils/logger');

function input(session, action, name, label, style = TextInputStyle.Short, value = '', required = false, maxLength = undefined) {
  const builder = new TextInputBuilder().setCustomId(id(session, 'input', action, name)).setLabel(label).setStyle(style).setRequired(required);
  if (value) builder.setValue(String(value).slice(0, maxLength || 4000));
  if (maxLength) builder.setMaxLength(maxLength);
  return new ActionRowBuilder().addComponents(builder);
}

function fileInput(session, action) {
  const builder = new FileUploadBuilder()
    .setCustomId(id(session, 'file', action, 'upload'))
    .setRequired(false)
    .setMinValues(0)
    .setMaxValues(1);
  return new LabelBuilder()
    .setLabel('Image upload (optional)')
    .setDescription('Choose one image file, or leave this empty to use the URL field.')
    .setFileUploadComponent(builder);
}

function modal(customId, title, rows) {
  const built = new ModalBuilder().setCustomId(customId).setTitle(title).addComponents(...rows);
  validateComponentTree(built.toJSON().components, `modal "${title}"`);
  return built;
}

async function showBuilder(interaction, session, message = null) {
  const payload = renderBuilder(session);
  if (message) payload.content = `${message}\n\n${payload.content}`;
  const { ephemeral, ...editablePayload } = payload;
  // Reattaching Discord-hosted media can take longer than Discord's three-second
  // initial-response window. Acknowledge first, then edit the builder response.
  if (payload.files?.length && !interaction.deferred && !interaction.replied && typeof interaction.deferUpdate === 'function') {
    await interaction.deferUpdate();
  }
  if (interaction.deferred || interaction.replied) return interaction.editReply(editablePayload);
  return interaction.update(editablePayload);
}

function parseCustomId(customId) {
  const [prefix, sessionId, revision, type, action, ...rest] = customId.split(':');
  if (prefix !== 'eb' || !sessionId || !/^\d+$/.test(revision) || !['button', 'select', 'modal'].includes(type) || !action) return null;
  return { sessionId, revision: Number(revision), type, action, value: rest.join(':') };
}

async function showEditModal(interaction, session, action, index = null) {
  const embed = session.configuration.embed;
  const buttons = session.configuration.buttons;
  const fields = embed.fields;
  if (index !== null) assertExistingIndex(action.startsWith('field') ? fields : buttons, index, 'selected item');
  const customId = id(session, 'modal', `submit_${action}`, index !== null ? index : '');
  const formInput = (name, label, style, value, required, maxLength) => input(session, action, name, label, style, value, required, maxLength);

  const modals = {
    modal_title: () => modal(customId, 'Edit Title', [formInput('title', 'Title', TextInputStyle.Short, embed.title, false, 256)]),
    modal_description: () => modal(customId, 'Edit Description', [formInput('description', 'Description', TextInputStyle.Paragraph, embed.description, false, 4000)]),
    modal_url: () => modal(customId, 'Edit Title URL', [formInput('url', 'URL', TextInputStyle.Short, embed.url, false, 500)]),
    modal_author: () => modal(customId, 'Edit Author', [
      formInput('name', 'Author Name', TextInputStyle.Short, embed.author?.name, false, 256),
      formInput('url', 'Author URL', TextInputStyle.Short, embed.author?.url, false, 500),
      formInput('iconUrl', 'Author Icon URL (optional)', TextInputStyle.Short, embed.author?.iconUrl, false, 500),
      fileInput(session, action),
    ]),
    modal_footer: () => modal(customId, 'Edit Footer', [
      formInput('text', 'Footer Text', TextInputStyle.Short, embed.footer?.text, false, 2048),
      formInput('iconUrl', 'Footer Icon URL (optional)', TextInputStyle.Short, embed.footer?.iconUrl, false, 500),
      fileInput(session, action),
    ]),
    modal_color: () => modal(customId, 'Set Color', [formInput('color', 'Hex Color', TextInputStyle.Short, embed.color || '#5865F2', false, 7)]),
    modal_thumbnail: () => modal(customId, 'Set Thumbnail', [formInput('url', 'Image URL (optional)', TextInputStyle.Short, embed.thumbnail, false, 500), fileInput(session, action)]),
    modal_image: () => modal(customId, 'Set Main Image', [formInput('url', 'Image URL (optional)', TextInputStyle.Short, embed.image, false, 500), fileInput(session, action)]),
    modal_field_add: () => modal(customId, 'Add Field', [
      formInput('name', 'Field Name', TextInputStyle.Short, '', true, 256),
      formInput('value', 'Field Value', TextInputStyle.Paragraph, '', true, 1024),
      formInput('inline', 'Inline? yes/no', TextInputStyle.Short, 'no', false, 10),
    ]),
    field_edit: () => modal(customId, 'Edit Field', [
      formInput('name', 'Field Name', TextInputStyle.Short, fields[index]?.name, true, 256),
      formInput('value', 'Field Value', TextInputStyle.Paragraph, fields[index]?.value, true, 1024),
      formInput('inline', 'Inline? yes/no', TextInputStyle.Short, fields[index]?.inline ? 'yes' : 'no', false, 10),
    ]),
    modal_button_external: () => modal(customId, 'Add URL Button', [
      formInput('label', 'Label', TextInputStyle.Short, '', true, 80),
      formInput('url', 'URL', TextInputStyle.Short, 'https://', true, 500),
      formInput('emoji', 'Emoji (optional)', TextInputStyle.Short, '', false, 80),
    ]),
    modal_button_channel: () => modal(customId, 'Add Channel Button', [
      formInput('label', 'Label', TextInputStyle.Short, 'Next', true, 80),
      formInput('emoji', 'Emoji (optional)', TextInputStyle.Short, '', false, 80),
    ]),
    button_edit: () => modal(customId, 'Edit Button', [
      formInput('label', 'Label', TextInputStyle.Short, buttons[index]?.label, true, 80),
      formInput('url', 'URL', TextInputStyle.Short, buttons[index]?.url, true, 500),
      formInput('emoji', 'Emoji (optional)', TextInputStyle.Short, buttons[index]?.emoji, false, 80),
    ]),
    modal_save: () => modal(customId, 'Save Template', [
      formInput('name', 'Template Name', TextInputStyle.Short, session.templateName || '', true, 64),
    ]),
  };

  const built = modals[action]?.();
  if (!built) throw new Error('Unknown editor action.');
  await interaction.showModal(built);
}

function read(fields, session, action, name) {
  return fields.getTextInputValue(id(session, 'input', action, name)).trim();
}

function uploadedImageUrl(fields, session, action, target) {
  const files = fields.getUploadedFiles(id(session, 'file', action, 'upload'), false);
  const file = files?.first?.();
  if (!file) return '';
  const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
  const extension = extensions[file.contentType];
  if (!extension) throw new Error('Please upload a JPG, PNG, WEBP, or GIF image.');
  if (!file.url) throw new Error('Discord did not provide an image URL for this upload.');
  let uploadUrl;
  try {
    uploadUrl = new URL(file.url);
  } catch {
    throw new Error('Discord provided an invalid image URL. Please upload it again.');
  }
  if (uploadUrl.protocol !== 'https:' || !['cdn.discordapp.com', 'media.discordapp.net'].includes(uploadUrl.hostname)) {
    throw new Error('The uploaded image URL is not a trusted Discord attachment.');
  }
  const previousTarget = { image: 'image', thumbnail: 'thumbnail', authorIcon: 'authorIcon', footerIcon: 'footerIcon' }[target];
  const previousValue = previousTarget === 'authorIcon'
    ? session.configuration.embed.author?.iconUrl
    : previousTarget === 'footerIcon' ? session.configuration.embed.footer?.iconUrl : session.configuration.embed[previousTarget];
  const previousFilename = previousValue?.startsWith('attachment://') ? previousValue.slice('attachment://'.length) : null;
  if (previousFilename) delete session.configuration.mediaAssets?.[previousFilename];
  if (file.size != null && file.size > 25 * 1024 * 1024) throw new Error('Please upload an image smaller than 25 MB.');
  const filename = `${crypto.randomUUID()}.${extension}`;
  session.configuration.mediaAssets = session.configuration.mediaAssets || {};
  session.configuration.mediaAssets[filename] = file.url;
  return `attachment://${filename}`;
}

function assertExistingIndex(items, index, label) {
  if (!Number.isInteger(index) || index < 0 || index >= items.length) throw new Error(`That ${label} is no longer available. Please choose it again.`);
}

async function handleModalSubmit(interaction, session, action, value) {
  const supportedActions = new Set([
    'submit_modal_title', 'submit_modal_description', 'submit_modal_url', 'submit_modal_author', 'submit_modal_footer',
    'submit_modal_color', 'submit_modal_thumbnail', 'submit_modal_image', 'submit_modal_field_add', 'submit_field_edit',
    'submit_modal_button_external', 'submit_modal_button_channel', 'submit_button_edit', 'submit_modal_save',
  ]);
  if (!supportedActions.has(action)) throw new Error('Unknown builder modal.');
  const embed = session.configuration.embed;
  const fields = interaction.fields;
  const index = value !== '' ? Number(value) : null;
  const editorAction = action.replace(/^submit_/, '');
  const valueOf = (name) => read(fields, session, editorAction, name);
  const uploadActions = new Set(['modal_author', 'modal_footer', 'modal_thumbnail', 'modal_image']);
  const uploadedFiles = uploadActions.has(editorAction)
    ? fields.getUploadedFiles(id(session, 'file', editorAction, 'upload'), false)
    : null;
  const hasMedia = Object.keys(session.configuration.mediaAssets || {}).length > 0;
  if ((uploadedFiles?.first?.() || hasMedia) && !interaction.deferred && !interaction.replied && typeof interaction.deferUpdate === 'function') {
    await interaction.deferUpdate();
  }

  if (action === 'submit_modal_title') embed.title = valueOf('title');
  if (action === 'submit_modal_description') embed.description = valueOf('description');
  if (action === 'submit_modal_url') embed.url = parseUrl(valueOf('url')) || '';
  if (action === 'submit_modal_author') {
    const iconUrl = uploadedImageUrl(fields, session, editorAction, 'authorIcon') || parseUrl(valueOf('iconUrl'), { requireHttps: true }) || '';
    embed.author = {
      name: valueOf('name'),
      url: parseUrl(valueOf('url')) || '',
      iconUrl,
    };
    if (!embed.author.name) embed.author = {};
  }
  if (action === 'submit_modal_footer') {
    const iconUrl = uploadedImageUrl(fields, session, editorAction, 'footerIcon') || parseUrl(valueOf('iconUrl'), { requireHttps: true }) || '';
    embed.footer = { text: valueOf('text'), iconUrl };
    if (!embed.footer.text) embed.footer = {};
  }
  if (action === 'submit_modal_color') embed.color = parseColor(valueOf('color'));
  if (action === 'submit_modal_thumbnail') embed.thumbnail = uploadedImageUrl(fields, session, editorAction, 'thumbnail') || parseUrl(valueOf('url'), { requireHttps: true }) || '';
  if (action === 'submit_modal_image') embed.image = uploadedImageUrl(fields, session, editorAction, 'image') || parseUrl(valueOf('url'), { requireHttps: true }) || '';
  if (action === 'submit_modal_field_add') {
    if (embed.fields.length >= 25) throw new Error('An embed can contain at most 25 fields.');
    embed.fields.push({ name: valueOf('name'), value: valueOf('value'), inline: booleanFromInput(valueOf('inline')) });
  }
  if (action === 'submit_field_edit') {
    assertExistingIndex(embed.fields, index, 'field');
    embed.fields[index] = { name: valueOf('name'), value: valueOf('value'), inline: booleanFromInput(valueOf('inline')) };
  }
  if (action === 'submit_modal_button_external') {
    if (session.configuration.buttons.length >= 25) throw new Error('An embed can contain at most 25 buttons.');
    const url = parseUrl(valueOf('url'), { requireHttps: true });
    session.configuration.buttons.push({ type: 'link', label: valueOf('label'), url, emoji: valueOf('emoji'), destinationType: 'external', destinationLabel: url });
  }
  if (action === 'submit_modal_button_channel') {
    if (session.configuration.buttons.length >= 25) throw new Error('An embed can contain at most 25 buttons.');
    session.pending.channelButton = { label: valueOf('label'), emoji: valueOf('emoji') };
    session.section = 'choose_channel_button';
  }
  if (action === 'submit_button_edit') {
    assertExistingIndex(session.configuration.buttons, index, 'button');
    const url = parseUrl(valueOf('url'), { requireHttps: true });
    session.configuration.buttons[index] = { ...session.configuration.buttons[index], label: valueOf('label'), url, emoji: valueOf('emoji'), destinationLabel: url };
  }
  if (action === 'submit_modal_save') {
    const saved = saveTemplate({ guildId: interaction.guildId, name: valueOf('name'), configuration: session.configuration, userId: interaction.user.id });
    session.templateName = saved.name;
    session.saved = true;
    logger.info(`Template "${saved.name}" saved`);
  } else {
    session.changed();
  }

  const payload = renderBuilder(session);
  const { ephemeral, ...editablePayload } = payload;
  if (interaction.deferred && typeof interaction.editReply === 'function') {
    await interaction.editReply(editablePayload);
  } else if (typeof interaction.update === 'function') {
    await interaction.update(editablePayload);
  } else {
    await interaction.reply(payload);
  }
}

async function handleButton(interaction) {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed) return false;
  if (parsed.type !== 'button') throw new Error('That builder control is invalid.');
  const session = sessionManager.get(interaction.guildId, interaction.user.id, parsed.sessionId);
  if (!session) {
    await interaction.reply({ content: 'This builder session has expired. Run /embed create again.', flags: MessageFlags.Ephemeral });
    return true;
  }
  if (session.revision !== parsed.revision) {
    await showBuilder(interaction, session, 'This builder was refreshed.');
    return true;
  }

  if (parsed.action === 'section') {
    if (!['home', 'content', 'appearance', 'media', 'fields', 'buttons', 'settings'].includes(parsed.value)) throw new Error('That builder section is invalid.');
    session.transition(parsed.value);
    await showBuilder(interaction, session);
    return true;
  }
  if (parsed.action === 'cancel') {
    sessionManager.delete(session);
    await interaction.update({ content: 'Builder session cancelled.', embeds: [], components: [] });
    return true;
  }
  if (parsed.action === 'clear_color') {
    session.configuration.embed.color = null;
    session.changed();
    await showBuilder(interaction, session);
    return true;
  }
  if (parsed.action === 'toggle_timestamp') {
    session.configuration.embed.timestamp = !session.configuration.embed.timestamp;
    session.changed();
    await showBuilder(interaction, session);
    return true;
  }
  if (parsed.action === 'remove_thumbnail' || parsed.action === 'remove_image') {
    const target = parsed.action === 'remove_thumbnail' ? 'thumbnail' : 'image';
    const previous = session.configuration.embed[target];
    if (previous?.startsWith('attachment://')) delete session.configuration.mediaAssets?.[previous.slice('attachment://'.length)];
    session.configuration.embed[target] = '';
    session.changed();
    await showBuilder(interaction, session);
    return true;
  }
  if (parsed.action === 'send_select') {
    session.transition('choose_send_channel');
    await showBuilder(interaction, session);
    return true;
  }
  if (parsed.action === 'cancel_channel_button') {
    session.transition('buttons');
    await showBuilder(interaction, session);
    return true;
  }
  if (parsed.action === 'cancel_send_channel') {
    session.transition('settings');
    await showBuilder(interaction, session);
    return true;
  }
  if (parsed.action === 'update_managed') {
    session.revision += 1;
    await interaction.deferUpdate();
    const managed = managedMessageRepository.findById(session.managedMessageId);
    if (!managed) throw new Error('That managed message is no longer tracked.');
    const updated = await updateManagedMessage({ client: interaction.client, guildId: interaction.guildId, managedRecord: managed, configuration: session.configuration, expectedUpdatedAt: session.managedMessageUpdatedAt });
    session.managedMessageUpdatedAt = updated.updated_at;
    session.saved = true;
    sessionManager.delete(session);
    return interaction.editReply({ content: 'Managed message updated.', embeds: [toEmbed(session.configuration)], components: toButtonRows(session.configuration) });
  }
  await showEditModal(interaction, session, parsed.action);
  return true;
}

function moveItem(items, index, direction) {
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= items.length) return;
  [items[index], items[target]] = [items[target], items[index]];
}

async function handleSelect(interaction) {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed) return false;
  if (parsed.type !== 'select') throw new Error('That builder control is invalid.');
  const session = sessionManager.get(interaction.guildId, interaction.user.id, parsed.sessionId);
  if (!session) {
    await interaction.reply({ content: 'This builder session has expired. Run /embed create again.', flags: MessageFlags.Ephemeral });
    return true;
  }
  if (session.revision !== parsed.revision) {
    await showBuilder(interaction, session, 'This builder was refreshed.');
    return true;
  }
  const selected = interaction.values[0];
  if (selected === 'none') return showBuilder(interaction, session, 'There is nothing to select yet.');
  const index = Number(selected);

  if (parsed.action === 'button_channel_select') {
    const channel = interaction.channels.first();
    const pending = session.pending.channelButton;
    if (!pending || session.section !== 'choose_channel_button') throw new Error('That channel-button selection is no longer active.');
    if (!channel) throw new Error('The selected channel is no longer available.');
    session.configuration.buttons.push({
      type: 'link',
      label: pending.label,
      emoji: pending.emoji,
      url: channelUrl(interaction.guildId, channel.id),
      destinationType: 'channel',
      destinationId: channel.id,
      destinationLabel: `#${channel.name}`,
    });
    session.pending.channelButton = null;
    session.section = 'buttons';
    session.changed();
    return showBuilder(interaction, session);
  }

  if (parsed.action === 'send_channel_select') {
    const channel = interaction.channels.first();
    if (session.section !== 'choose_send_channel') throw new Error('That send selection is no longer active.');
    if (!channel) throw new Error('The selected channel is no longer available.');
    session.revision += 1;
    await interaction.deferUpdate();
    const record = await sendConfiguration({ guild: interaction.guild, channel, clientUser: interaction.client.user, configuration: session.configuration, templateName: session.templateName });
    logger.info(`Template "${session.templateName || 'draft'}" sent`, { channelId: channel.id, messageId: record.message_id });
    sessionManager.delete(session);
    return interaction.editReply({ content: `Sent to #${channel.name}. Managed message ID: ${record.message_id}`, embeds: [toEmbed(session.configuration)], components: toButtonRows(session.configuration) });
  }

  if (parsed.action === 'field_edit' || parsed.action === 'button_edit') {
    assertExistingIndex(parsed.action === 'field_edit' ? session.configuration.embed.fields : session.configuration.buttons, index, parsed.action === 'field_edit' ? 'field' : 'button');
    await showEditModal(interaction, session, parsed.action, index);
    return true;
  }
  const targetItems = parsed.action.startsWith('field_') ? session.configuration.embed.fields : session.configuration.buttons;
  if (!['field_remove', 'button_remove', 'field_move_up', 'field_move_down', 'button_move_up', 'button_move_down'].includes(parsed.action)) throw new Error('Unknown builder selection.');
  assertExistingIndex(targetItems, index, parsed.action.startsWith('field') ? 'field' : 'button');
  if (parsed.action === 'field_remove' || parsed.action === 'button_remove') targetItems.splice(index, 1);
  if (parsed.action.endsWith('move_up')) moveItem(targetItems, index, 'up');
  if (parsed.action.endsWith('move_down')) moveItem(targetItems, index, 'down');
  session.changed();
  return showBuilder(interaction, session);
}

module.exports = { handleButton, handleSelect, handleModalSubmit, parseCustomId, showBuilder };
