const { ChannelType } = require('discord.js');
const { toEmbed, toButtonRows } = require('../embed-builder/renderer');
const { assertValidConfiguration } = require('../embed-builder/validators');
const managedMessageRepository = require('../database/repositories/managedMessageRepository');
const templateRepository = require('../database/repositories/templateRepository');
const { missingSendPermissions } = require('./permissionService');

function assertSendableChannel(channel) {
  if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
    throw new Error('Choose a text or announcement channel.');
  }
}

async function sendConfiguration({ guild, channel, clientUser, configuration, templateName = null }) {
  assertSendableChannel(channel);
  const missing = missingSendPermissions(channel, guild.members.me);
  if (missing.length) throw new Error('I am missing permissions in that channel. Required: View Channel, Send Messages, Embed Links, Read Message History.');
  assertValidConfiguration(configuration);

  const message = await channel.send({ embeds: [toEmbed(configuration)], components: toButtonRows(configuration) });
  const template = templateName ? templateRepository.findByName(guild.id, templateName) : null;
  return managedMessageRepository.save({
    guildId: guild.id,
    channelId: channel.id,
    messageId: message.id,
    templateId: template?.id || null,
    configuration,
  });
}

async function updateManagedMessage({ client, guildId, managedRecord, configuration }) {
  assertValidConfiguration(configuration);
  if (managedRecord.guild_id !== guildId) throw new Error('That managed message does not belong to this server.');
  const channel = await client.channels.fetch(managedRecord.channel_id);
  if (!channel) throw new Error('The original channel no longer exists.');
  const message = await channel.messages.fetch(managedRecord.message_id);
  if (!message) throw new Error('The original message no longer exists.');
  if (message.author.id !== client.user.id) throw new Error('I will only edit messages created by this bot.');
  await message.edit({ embeds: [toEmbed(configuration)], components: toButtonRows(configuration) });
  return managedMessageRepository.save({
    guildId,
    channelId: channel.id,
    messageId: message.id,
    templateId: managedRecord.template_id,
    configuration,
  });
}

module.exports = { sendConfiguration, updateManagedMessage };
