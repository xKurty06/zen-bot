const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require('discord.js');
const { validateConfiguration } = require('./validators');

function id(session, type, action, value = '') {
  const parts = ['eb', session.id, String(session.revision), type, action];
  if (value !== '') parts.push(String(value));
  const customId = parts.join(':');
  if (customId.length > 100) throw new Error(`Builder component ID is too long for ${type}:${action}.`);
  return customId;
}

function hasContent(source) {
  return Boolean(
    source.title ||
    source.description ||
    source.url ||
    source.author?.name ||
    source.footer?.text ||
    source.thumbnail ||
    source.image ||
    source.fields?.length
  );
}

function toEmbed(configuration, options = {}) {
  const source = configuration.embed;
  const embed = new EmbedBuilder();
  if (options.draft && !hasContent(source)) {
    embed.setDescription('Draft preview: use the controls below to add embed content.');
    return embed;
  }
  if (source.title) embed.setTitle(source.title);
  if (source.description) embed.setDescription(source.description);
  if (source.url) embed.setURL(source.url);
  if (source.color) embed.setColor(Number.parseInt(source.color.replace('#', ''), 16));
  if (source.author?.name) embed.setAuthor({ name: source.author.name, url: source.author.url || undefined, iconURL: source.author.iconUrl || undefined });
  if (source.footer?.text) embed.setFooter({ text: source.footer.text, iconURL: source.footer.iconUrl || undefined });
  if (source.thumbnail) embed.setThumbnail(source.thumbnail);
  if (source.image) embed.setImage(source.image);
  if (source.timestamp) embed.setTimestamp();
  if (source.fields?.length) embed.addFields(source.fields.map((field) => ({ name: field.name, value: field.value, inline: Boolean(field.inline) })));
  return embed;
}

function toButtonRows(configuration) {
  const rows = [];
  const buttons = configuration.buttons || [];
  for (let i = 0; i < buttons.length; i += 5) {
    const row = new ActionRowBuilder();
    buttons.slice(i, i + 5).forEach((button) => {
      const builder = new ButtonBuilder()
        .setLabel(button.label)
        .setStyle(ButtonStyle.Link)
        .setURL(button.url);
      if (button.emoji) builder.setEmoji(button.emoji);
      row.addComponents(builder);
    });
    rows.push(row);
  }
  validateComponentTree(rows, 'embed button components');
  return rows;
}

function buttonSummary(configuration) {
  const buttons = configuration.buttons || [];
  if (!buttons.length) return 'Buttons: none';
  return [
    'Buttons:',
    ...buttons.map((button, index) => `${index + 1}. ${button.label}${button.destinationLabel ? ` -> ${button.destinationLabel}` : ` -> ${button.url}`}`.slice(0, 160)),
  ].join('\n');
}

function statusContent(session) {
  const errors = validateConfiguration(session.configuration);
  const content = [
    `Embed Builder`,
    `Template: ${session.templateName || '(unsaved draft)'}`,
    `Status: ${session.saved ? 'Saved' : 'Unsaved'}`,
    `Section: ${session.section}`,
    '',
    'Media tip: use Set Thumbnail, Set Image, Edit Author, or Edit Footer to paste a URL or upload an image directly in the modal.',
    buttonSummary(session.configuration),
    errors.length ? `\nValidation:\n${errors.slice(0, 4).join('\n')}` : '',
  ].filter(Boolean).join('\n');
  return content.length > 1_990 ? `${content.slice(0, 1_980)}\n…` : content;
}

function row(...buttons) {
  return new ActionRowBuilder().addComponents(...buttons);
}

function navButton(session, action, label, style = ButtonStyle.Secondary, value = '') {
  return new ButtonBuilder().setCustomId(id(session, 'button', action, value)).setLabel(label).setStyle(style);
}

function select(session, action, placeholder, options) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(id(session, 'select', action))
      .setPlaceholder(placeholder)
      .addOptions(options),
  );
}

function indexOptions(items, emptyLabel = 'No items') {
  if (!items.length) {
    return [new StringSelectMenuOptionBuilder().setLabel(emptyLabel).setValue('none')];
  }
  return items.map((item, index) => new StringSelectMenuOptionBuilder()
    .setLabel(`${index + 1}. ${item.name || item.label}`.slice(0, 100))
    .setValue(String(index))
    .setDescription((item.value || item.destinationLabel || item.url || 'No description').slice(0, 100)));
}

function buildControls(session) {
  switch (session.section) {
    case 'content':
      return [
        row(navButton(session, 'modal_title', 'Edit Title'), navButton(session, 'modal_description', 'Edit Description'), navButton(session, 'modal_url', 'Edit URL')),
        row(navButton(session, 'modal_author', 'Edit Author'), navButton(session, 'modal_footer', 'Edit Footer'), navButton(session, 'section', 'Back', ButtonStyle.Secondary, 'home')),
      ];
    case 'appearance':
      return [
        row(navButton(session, 'modal_color', 'Set Color'), navButton(session, 'clear_color', 'Clear Color'), navButton(session, 'toggle_timestamp', 'Toggle Timestamp')),
        row(navButton(session, 'section', 'Back', ButtonStyle.Secondary, 'home')),
      ];
    case 'media':
      return [
        row(navButton(session, 'modal_thumbnail', 'Set Thumbnail'), navButton(session, 'modal_image', 'Set Image')),
        row(navButton(session, 'remove_thumbnail', 'Remove Thumbnail'), navButton(session, 'remove_image', 'Remove Image')),
        row(navButton(session, 'section', 'Back', ButtonStyle.Secondary, 'home')),
      ];
    case 'fields':
      return [
        row(navButton(session, 'modal_field_add', 'Add Field'), navButton(session, 'section', 'Back', ButtonStyle.Secondary, 'home')),
        select(session, 'field_edit', 'Edit a field', indexOptions(session.configuration.embed.fields, 'No fields to edit')),
        select(session, 'field_remove', 'Remove a field', indexOptions(session.configuration.embed.fields, 'No fields to remove')),
        select(session, 'field_move_up', 'Move field up', indexOptions(session.configuration.embed.fields, 'No fields to move')),
        select(session, 'field_move_down', 'Move field down', indexOptions(session.configuration.embed.fields, 'No fields to move')),
      ];
    case 'buttons':
      return [
        row(navButton(session, 'modal_button_external', 'Add URL Button'), navButton(session, 'modal_button_channel', 'Add Channel Button'), navButton(session, 'section', 'Back', ButtonStyle.Secondary, 'home')),
        select(session, 'button_edit', 'Edit a button', indexOptions(session.configuration.buttons, 'No buttons to edit')),
        select(session, 'button_remove', 'Remove a button', indexOptions(session.configuration.buttons, 'No buttons to remove')),
        select(session, 'button_move_up', 'Move button up', indexOptions(session.configuration.buttons, 'No buttons to move')),
        select(session, 'button_move_down', 'Move button down', indexOptions(session.configuration.buttons, 'No buttons to move')),
      ];
    case 'settings':
      return [
        row(
          navButton(session, 'modal_save', 'Save Template', ButtonStyle.Success),
          session.mode === 'managed-message'
            ? navButton(session, 'update_managed', 'Update Message', ButtonStyle.Primary)
            : navButton(session, 'send_select', 'Send', ButtonStyle.Primary),
          navButton(session, 'cancel', 'Cancel', ButtonStyle.Danger),
        ),
        row(navButton(session, 'section', 'Back', ButtonStyle.Secondary, 'home')),
      ];
    case 'choose_channel_button':
      return [
        new ActionRowBuilder().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId(id(session, 'select', 'button_channel_select'))
            .setPlaceholder('Choose the destination channel')
            .setMinValues(1)
            .setMaxValues(1)
            .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum),
        ),
        row(navButton(session, 'section', 'Back', ButtonStyle.Secondary, 'buttons'), navButton(session, 'cancel_channel_button', 'Cancel', ButtonStyle.Secondary)),
      ];
    case 'choose_send_channel':
      return [
        new ActionRowBuilder().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId(id(session, 'select', 'send_channel_select'))
            .setPlaceholder('Choose where to post this embed')
            .setMinValues(1)
            .setMaxValues(1)
            .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        ),
        row(navButton(session, 'section', 'Back', ButtonStyle.Secondary, 'settings'), navButton(session, 'cancel_send_channel', 'Cancel', ButtonStyle.Secondary)),
      ];
    default:
      return [
        row(navButton(session, 'section', 'Content', ButtonStyle.Primary, 'content'), navButton(session, 'section', 'Appearance', ButtonStyle.Primary, 'appearance'), navButton(session, 'section', 'Media', ButtonStyle.Primary, 'media')),
        row(navButton(session, 'section', 'Fields', ButtonStyle.Primary, 'fields'), navButton(session, 'section', 'Buttons', ButtonStyle.Primary, 'buttons'), navButton(session, 'section', 'Settings', ButtonStyle.Primary, 'settings')),
        row(
          navButton(session, 'modal_save', 'Save', ButtonStyle.Success),
          session.mode === 'managed-message'
            ? navButton(session, 'update_managed', 'Update', ButtonStyle.Success)
            : navButton(session, 'send_select', 'Send', ButtonStyle.Success),
          navButton(session, 'cancel', 'Cancel', ButtonStyle.Danger),
        ),
      ];
  }
}

function renderBuilder(session) {
  const payload = {
    content: statusContent(session),
    embeds: [toEmbed(session.configuration, { draft: true })],
    components: buildControls(session),
    ephemeral: true,
  };
  validateComponentTree(payload.components, 'builder message');
  return payload;
}

function validateComponentTree(rows, context = 'component tree') {
  if (!Array.isArray(rows) || rows.length > 5) throw new Error(`${context} has more than five action rows.`);
  const seen = new Set();
  const visit = (component, inActionRow = false) => {
    if (component.custom_id) {
      if (seen.has(component.custom_id)) throw new Error(`${context} contains duplicate custom_id "${component.custom_id}".`);
      seen.add(component.custom_id);
    }
    if (component.type === 18) {
      if (!component.component) throw new Error(`${context} contains an invalid labeled component.`);
      visit(component.component);
      return;
    }
    if (component.type === 1) {
      const children = component.components || [];
      if (!children.length || children.length > 5) throw new Error(`${context} contains an invalid action row.`);
      const selects = children.filter((child) => child.type === 3 || child.type === 8).length;
      if (selects && children.length !== 1) throw new Error(`${context} mixes a select menu with other controls.`);
      children.forEach((child) => visit(child, true));
      return;
    }
    if (inActionRow && ![2, 3, 4, 8, 19].includes(component.type)) {
      throw new Error(`${context} contains an unsupported action-row component.`);
    }
  };
  rows.forEach((rowValue) => visit(typeof rowValue.toJSON === 'function' ? rowValue.toJSON() : rowValue));
}

module.exports = { id, renderBuilder, toEmbed, toButtonRows, validateComponentTree };
