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
    .addStringOption((option) => option.setName('name').setDescription('Optional template name').setMaxLength(64).setAutocomplete(true)))
  .addSubcommand((sub) => sub
    .setName('edit-template')
    .setDescription('Edit a saved template.')
    .addStringOption((option) => option.setName('name').setDescription('Template name').setRequired(true).setAutocomplete(true)))
  .addSubcommand((sub) => sub
    .setName('edit-message')
    .setDescription('Edit a managed message.')
    .addStringOption((option) => option.setName('message_id').setDescription('Managed message ID').setRequired(true)))
  .addSubcommand((sub) => sub
    .setName('save')
    .setDescription('Save your latest active builder draft.')
    .addStringOption((option) => option.setName('name').setDescription('Template name').setRequired(true).setMaxLength(64).setAutocomplete(true)))
  .addSubcommand((sub) => sub
    .setName('list')
    .setDescription('List saved templates.'))
  .addSubcommand((sub) => sub
    .setName('preview')
    .setDescription('Preview a saved template.')
    .addStringOption((option) => option.setName('name').setDescription('Template name').setRequired(true).setAutocomplete(true)))
  .addSubcommand((sub) => sub
    .setName('send')
    .setDescription('Send a saved template to a channel.')
    .addStringOption((option) => option.setName('name').setDescription('Template name').setRequired(true).setAutocomplete(true))
    .addChannelOption((option) => option.setName('channel').setDescription('Destination channel').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
  .addSubcommand((sub) => sub
    .setName('upload')
    .setDescription('Attach an image for the current builder session.')
    .addStringOption((option) => option
      .setName('type')
      .setDescription('Which image to update')
      .setRequired(true)
      .addChoices(
        { name: 'Thumbnail', value: 'thumbnail' },
        { name: 'Main Image', value: 'image' },
        { name: 'Author Icon', value: 'author_icon' },
        { name: 'Footer Icon', value: 'footer_icon' },
      ))
    .addAttachmentOption((option) => option.setName('image').setDescription('Image file to upload').setRequired(true)))
  .addSubcommand((sub) => sub
    .setName('delete')
    .setDescription('Delete a template after confirmation.')
    .addStringOption((option) => option.setName('name').setDescription('Template name').setRequired(true).setAutocomplete(true)))
  .addSubcommand((sub) => sub
    .setName('duplicate')
    .setDescription('Duplicate a template.')
    .addStringOption((option) => option.setName('from').setDescription('Existing template').setRequired(true).setAutocomplete(true))
    .addStringOption((option) => option.setName('to').setDescription('New template name').setRequired(true)))
  .addSubcommand((sub) => sub
    .setName('info')
    .setDescription('Show template and managed message metadata.')
    .addStringOption((option) => option.setName('name').setDescription('Template name').setAutocomplete(true))
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
