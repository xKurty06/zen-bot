const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const sessionManager = require('./embed-builder/sessionManager');
const { renderBuilder, toEmbed, toButtonRows } = require('./embed-builder/renderer');
const { parseColor, parseUrl, booleanFromInput } = require('./utils/validation');
const { channelUrl } = require('./utils/discordUrls');
const { saveTemplate } = require('./services/embedService');
const { sendConfiguration, updateManagedMessage } = require('./services/messageService');
const managedMessageRepository = require('./database/repositories/managedMessageRepository');
const logger = require('./utils/logger');

function input(id, label, style = TextInputStyle.Short, value = '', required = false, maxLength = undefined) {
  const builder = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required);
  if (value) builder.setValue(String(value).slice(0, maxLength || 4000));
  if (maxLength) builder.setMaxLength(maxLength);
  return new ActionRowBuilder().addComponents(builder);
}

function modal(customId, title, rows) {
  return new ModalBuilder().setCustomId(customId).setTitle(title).addComponents(...rows);
}

async function showBuilder(interaction, session, message = null) {
  const payload = renderBuilder(session);
  if (message) payload.content = `${message}\n\n${payload.content}`;
  const { ephemeral, ...editablePayload } = payload;
  if (interaction.deferred || interaction.replied) return interaction.editReply(editablePayload);
  return interaction.update(editablePayload);
}

function parseCustomId(customId) {
  const [prefix, sessionId, action, ...rest] = customId.split(':');
  if (prefix !== 'eb') return null;
  return { sessionId, action, value: rest.join(':') };
}

function getSession(interaction, sessionId) {
  const session = sessionManager.get(interaction.guildId, interaction.user.id, sessionId);
  if (!session) throw new Error('This builder session has expired. Run /embed create again.');
  return session;
}

async function showEditModal(interaction, session, action, index = null) {
  const embed = session.configuration.embed;
  const buttons = session.configuration.buttons;
  const fields = embed.fields;
  const customId = `eb:${session.id}:submit_${action}${index !== null ? `:${index}` : ''}`;

  const modals = {
    modal_title: () => modal(customId, 'Edit Title', [input('title', 'Title', TextInputStyle.Short, embed.title, false, 256)]),
    modal_description: () => modal(customId, 'Edit Description', [input('description', 'Description', TextInputStyle.Paragraph, embed.description, false, 4000)]),
    modal_url: () => modal(customId, 'Edit Title URL', [input('url', 'URL', TextInputStyle.Short, embed.url, false, 500)]),
    modal_author: () => modal(customId, 'Edit Author', [
      input('name', 'Author Name', TextInputStyle.Short, embed.author?.name, false, 256),
      input('url', 'Author URL', TextInputStyle.Short, embed.author?.url, false, 500),
      input('iconUrl', 'Author Icon URL (or use /embed upload type:author_icon)', TextInputStyle.Short, embed.author?.iconUrl, false, 500),
    ]),
    modal_footer: () => modal(customId, 'Edit Footer', [
      input('text', 'Footer Text', TextInputStyle.Short, embed.footer?.text, false, 2048),
      input('iconUrl', 'Footer Icon URL (or use /embed upload type:footer_icon)', TextInputStyle.Short, embed.footer?.iconUrl, false, 500),
    ]),
    modal_color: () => modal(customId, 'Set Color', [input('color', 'Hex Color', TextInputStyle.Short, embed.color || '#5865F2', false, 7)]),
    modal_thumbnail: () => modal(customId, 'Set Thumbnail', [input('url', 'Image URL (or use /embed upload type:thumbnail)', TextInputStyle.Short, embed.thumbnail, false, 500)]),
    modal_image: () => modal(customId, 'Set Main Image', [input('url', 'Image URL (or use /embed upload type:image)', TextInputStyle.Short, embed.image, false, 500)]),
    modal_field_add: () => modal(customId, 'Add Field', [
      input('name', 'Field Name', TextInputStyle.Short, '', true, 256),
      input('value', 'Field Value', TextInputStyle.Paragraph, '', true, 1024),
      input('inline', 'Inline? yes/no', TextInputStyle.Short, 'no', false, 10),
    ]),
    field_edit: () => modal(customId, 'Edit Field', [
      input('name', 'Field Name', TextInputStyle.Short, fields[index]?.name, true, 256),
      input('value', 'Field Value', TextInputStyle.Paragraph, fields[index]?.value, true, 1024),
      input('inline', 'Inline? yes/no', TextInputStyle.Short, fields[index]?.inline ? 'yes' : 'no', false, 10),
    ]),
    modal_button_external: () => modal(customId, 'Add URL Button', [
      input('label', 'Label', TextInputStyle.Short, '', true, 80),
      input('url', 'URL', TextInputStyle.Short, 'https://', true, 500),
      input('emoji', 'Emoji (optional)', TextInputStyle.Short, '', false, 80),
    ]),
    modal_button_channel: () => modal(customId, 'Add Channel Button', [
      input('label', 'Label', TextInputStyle.Short, 'Next', true, 80),
      input('emoji', 'Emoji (optional)', TextInputStyle.Short, '', false, 80),
    ]),
    button_edit: () => modal(customId, 'Edit Button', [
      input('label', 'Label', TextInputStyle.Short, buttons[index]?.label, true, 80),
      input('url', 'URL', TextInputStyle.Short, buttons[index]?.url, true, 500),
      input('emoji', 'Emoji (optional)', TextInputStyle.Short, buttons[index]?.emoji, false, 80),
    ]),
    modal_save: () => modal(customId, 'Save Template', [
      input('name', 'Template Name', TextInputStyle.Short, session.templateName || '', true, 64),
    ]),
  };

  const built = modals[action]?.();
  if (!built) throw new Error('Unknown editor action.');
  await interaction.showModal(built);
}

function read(fields, name) {
  return fields.getTextInputValue(name).trim();
}

async function handleModalSubmit(interaction, session, action, value) {
  const embed = session.configuration.embed;
  const fields = interaction.fields;
  const index = value !== '' ? Number(value) : null;

  if (action === 'submit_modal_title') embed.title = read(fields, 'title');
  if (action === 'submit_modal_description') embed.description = read(fields, 'description');
  if (action === 'submit_modal_url') embed.url = parseUrl(read(fields, 'url')) || '';
  if (action === 'submit_modal_author') {
    embed.author = {
      name: read(fields, 'name'),
      url: parseUrl(read(fields, 'url')) || '',
      iconUrl: parseUrl(read(fields, 'iconUrl')) || '',
    };
    if (!embed.author.name) embed.author = {};
  }
  if (action === 'submit_modal_footer') {
    embed.footer = { text: read(fields, 'text'), iconUrl: parseUrl(read(fields, 'iconUrl')) || '' };
    if (!embed.footer.text) embed.footer = {};
  }
  if (action === 'submit_modal_color') embed.color = parseColor(read(fields, 'color'));
  if (action === 'submit_modal_thumbnail') embed.thumbnail = parseUrl(read(fields, 'url'), { requireHttps: true }) || '';
  if (action === 'submit_modal_image') embed.image = parseUrl(read(fields, 'url'), { requireHttps: true }) || '';
  if (action === 'submit_modal_field_add') {
    embed.fields.push({ name: read(fields, 'name'), value: read(fields, 'value'), inline: booleanFromInput(read(fields, 'inline')) });
  }
  if (action === 'submit_field_edit') {
    embed.fields[index] = { name: read(fields, 'name'), value: read(fields, 'value'), inline: booleanFromInput(read(fields, 'inline')) };
  }
  if (action === 'submit_modal_button_external') {
    const url = parseUrl(read(fields, 'url'), { requireHttps: true });
    session.configuration.buttons.push({ type: 'link', label: read(fields, 'label'), url, emoji: read(fields, 'emoji'), destinationType: 'external', destinationLabel: url });
  }
  if (action === 'submit_modal_button_channel') {
    session.pending.channelButton = { label: read(fields, 'label'), emoji: read(fields, 'emoji') };
    session.section = 'choose_channel_button';
  }
  if (action === 'submit_button_edit') {
    const url = parseUrl(read(fields, 'url'));
    session.configuration.buttons[index] = { ...session.configuration.buttons[index], label: read(fields, 'label'), url, emoji: read(fields, 'emoji'), destinationLabel: url };
  }
  if (action === 'submit_modal_save') {
    const saved = saveTemplate({ guildId: interaction.guildId, name: read(fields, 'name'), configuration: session.configuration, userId: interaction.user.id });
    session.templateName = saved.name;
    session.saved = true;
    logger.info(`Template "${saved.name}" saved`);
  } else {
    session.saved = false;
  }

  const payload = renderBuilder(session);
  const { ephemeral, ...editablePayload } = payload;
  if (typeof interaction.update === 'function') {
    await interaction.update(editablePayload);
  } else {
    await interaction.reply(payload);
  }
}

async function handleButton(interaction) {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed) return false;
  const session = getSession(interaction, parsed.sessionId);

  if (parsed.action === 'section') {
    session.section = parsed.value;
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
    session.saved = false;
    await showBuilder(interaction, session);
    return true;
  }
  if (parsed.action === 'toggle_timestamp') {
    session.configuration.embed.timestamp = !session.configuration.embed.timestamp;
    session.saved = false;
    await showBuilder(interaction, session);
    return true;
  }
  if (parsed.action === 'remove_thumbnail' || parsed.action === 'remove_image') {
    session.configuration.embed[parsed.action === 'remove_thumbnail' ? 'thumbnail' : 'image'] = '';
    session.saved = false;
    await showBuilder(interaction, session);
    return true;
  }
  if (parsed.action === 'send_select') {
    session.section = 'choose_send_channel';
    await showBuilder(interaction, session);
    return true;
  }
  if (parsed.action === 'update_managed') {
    await interaction.deferUpdate();
    const managed = managedMessageRepository.findById(session.managedMessageId);
    if (!managed) throw new Error('That managed message is no longer tracked.');
    await updateManagedMessage({ client: interaction.client, guildId: interaction.guildId, managedRecord: managed, configuration: session.configuration });
    session.saved = true;
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
  const session = getSession(interaction, parsed.sessionId);
  const selected = interaction.values[0];
  if (selected === 'none') return showBuilder(interaction, session, 'There is nothing to select yet.');
  const index = Number(selected);

  if (parsed.action === 'button_channel_select') {
    const channel = interaction.channels.first();
    const pending = session.pending.channelButton;
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
    session.saved = false;
    return showBuilder(interaction, session);
  }

  if (parsed.action === 'send_channel_select') {
    const channel = interaction.channels.first();
    await interaction.deferUpdate();
    const record = await sendConfiguration({ guild: interaction.guild, channel, clientUser: interaction.client.user, configuration: session.configuration, templateName: session.templateName });
    logger.info(`Template "${session.templateName || 'draft'}" sent`, { channelId: channel.id, messageId: record.message_id });
    return interaction.editReply({ content: `Sent to #${channel.name}. Managed message ID: ${record.message_id}`, embeds: [toEmbed(session.configuration)], components: toButtonRows(session.configuration) });
  }

  if (parsed.action === 'field_edit' || parsed.action === 'button_edit') {
    await showEditModal(interaction, session, parsed.action, index);
    return true;
  }
  if (parsed.action === 'field_remove') session.configuration.embed.fields.splice(index, 1);
  if (parsed.action === 'button_remove') session.configuration.buttons.splice(index, 1);
  if (parsed.action === 'field_move_up') moveItem(session.configuration.embed.fields, index, 'up');
  if (parsed.action === 'field_move_down') moveItem(session.configuration.embed.fields, index, 'down');
  if (parsed.action === 'button_move_up') moveItem(session.configuration.buttons, index, 'up');
  if (parsed.action === 'button_move_down') moveItem(session.configuration.buttons, index, 'down');
  session.saved = false;
  return showBuilder(interaction, session);
}

module.exports = { handleButton, handleSelect, handleModalSubmit, parseCustomId };
