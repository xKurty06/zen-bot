const {
  ChannelType,
  PermissionsBitField,
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

const uptimeCommand = new SlashCommandBuilder()
  .setName('uptime')
  .setDescription('Show how long the bot has been online since startup.');

const checkSyncCommand = new SlashCommandBuilder()
  .setName('checksync')
  .setDescription('Check whether category channels have synchronized permissions.')
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels);

const notifyCommand = new SlashCommandBuilder()
  .setName('notify')
  .setDescription('Configure role-holder milestone notifications.')
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
  .addSubcommand((sub) => sub
    .setName('create')
    .setDescription('Create a role-holder notification.')
    .addRoleOption((option) => option.setName('role').setDescription('Role to monitor').setRequired(true))
    .addIntegerOption((option) => option.setName('target').setDescription('Target holder count').setRequired(true).setMinValue(1).setMaxValue(100000))
    .addChannelOption((option) => option.setName('channel').setDescription('Notification channel').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addMentionableOption((option) => option.setName('ping').setDescription('User or role to ping').setRequired(true)))
  .addSubcommand((sub) => sub.setName('list').setDescription('List role-holder notifications.'))
  .addSubcommand((sub) => sub
    .setName('view')
    .setDescription('View a notification configuration.')
    .addIntegerOption((option) => option.setName('id').setDescription('Notification ID').setRequired(true).setMinValue(1)))
  .addSubcommand((sub) => sub
    .setName('edit')
    .setDescription('Edit a notification configuration.')
    .addIntegerOption((option) => option.setName('id').setDescription('Notification ID').setRequired(true).setMinValue(1))
    .addRoleOption((option) => option.setName('role').setDescription('Replacement role to monitor'))
    .addIntegerOption((option) => option.setName('target').setDescription('Replacement target holder count').setMinValue(1).setMaxValue(100000))
    .addChannelOption((option) => option.setName('channel').setDescription('Replacement notification channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addMentionableOption((option) => option.setName('ping').setDescription('Replacement user or role to ping')))
  .addSubcommand((sub) => sub.setName('enable').setDescription('Enable a notification.').addIntegerOption((option) => option.setName('id').setDescription('Notification ID').setRequired(true).setMinValue(1)))
  .addSubcommand((sub) => sub.setName('disable').setDescription('Disable a notification.').addIntegerOption((option) => option.setName('id').setDescription('Notification ID').setRequired(true).setMinValue(1)))
  .addSubcommand((sub) => sub.setName('reset').setDescription('Reset milestone progress.').addIntegerOption((option) => option.setName('id').setDescription('Notification ID').setRequired(true).setMinValue(1)))
  .addSubcommand((sub) => sub.setName('delete').setDescription('Delete a notification.').addIntegerOption((option) => option.setName('id').setDescription('Notification ID').setRequired(true).setMinValue(1)));

const notifyTestCommand = new SlashCommandBuilder()
  .setName('notifytest')
  .setDescription('Send a test notification without changing milestone progress.')
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
  .addIntegerOption((option) => option.setName('id').setDescription('Notification ID; defaults to the first configuration').setMinValue(1));

const roleCountCommand = new SlashCommandBuilder()
  .setName('rolecount')
  .setDescription('Count members with a selected role.')
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
  .addRoleOption((option) => option.setName('role').setDescription('Role to count').setRequired(true));

module.exports = [embedCommand, pingCommand, helpCommand, aboutCommand, uptimeCommand, checkSyncCommand, notifyCommand, notifyTestCommand, roleCountCommand];
