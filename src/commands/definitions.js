const {
  ChannelType,
  SlashCommandBuilder,
} = require('discord.js');

const embedCommand = new SlashCommandBuilder()
  .setName('embed')
  .setDescription('Create and manage Discord embed templates.')
  .addSubcommand((sub) => sub
    .setName('create')
    .setDescription('Open a live embed builder.')
    .addStringOption((option) => option.setName('name').setDescription('Optional template name').setMaxLength(64)))
  .addSubcommand((sub) => sub
    .setName('edit')
    .setDescription('Edit a saved template or managed message.')
    .addStringOption((option) => option
      .setName('type')
      .setDescription('What to edit')
      .setRequired(true)
      .addChoices({ name: 'Template', value: 'template' }, { name: 'Posted Message', value: 'message' }))
    .addStringOption((option) => option.setName('name').setDescription('Template name, when editing a template'))
    .addStringOption((option) => option.setName('message_id').setDescription('Managed Discord message ID, when editing a posted message')))
  .addSubcommand((sub) => sub
    .setName('save')
    .setDescription('Save your latest active builder draft.')
    .addStringOption((option) => option.setName('name').setDescription('Template name').setRequired(true).setMaxLength(64)))
  .addSubcommand((sub) => sub
    .setName('list')
    .setDescription('List saved templates.'))
  .addSubcommand((sub) => sub
    .setName('preview')
    .setDescription('Preview a saved template.')
    .addStringOption((option) => option.setName('name').setDescription('Template name').setRequired(true)))
  .addSubcommand((sub) => sub
    .setName('send')
    .setDescription('Send a saved template to a channel.')
    .addStringOption((option) => option.setName('name').setDescription('Template name').setRequired(true))
    .addChannelOption((option) => option.setName('channel').setDescription('Destination channel').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
  .addSubcommand((sub) => sub
    .setName('delete')
    .setDescription('Delete a template after confirmation.')
    .addStringOption((option) => option.setName('name').setDescription('Template name').setRequired(true)))
  .addSubcommand((sub) => sub
    .setName('duplicate')
    .setDescription('Duplicate a template.')
    .addStringOption((option) => option.setName('from').setDescription('Existing template').setRequired(true))
    .addStringOption((option) => option.setName('to').setDescription('New template name').setRequired(true)))
  .addSubcommand((sub) => sub
    .setName('info')
    .setDescription('Show template and managed message metadata.')
    .addStringOption((option) => option.setName('name').setDescription('Template name'))
    .addStringOption((option) => option.setName('message_id').setDescription('Managed message ID')));

const pingCommand = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Show bot latency.');

const helpCommand = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Show embed builder help.');

const aboutCommand = new SlashCommandBuilder()
  .setName('about')
  .setDescription('Show information about this bot.');

module.exports = [embedCommand, pingCommand, helpCommand, aboutCommand];
