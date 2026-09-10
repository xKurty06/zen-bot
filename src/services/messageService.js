const { ChannelType } = require('discord.js');
const { toEmbed, toButtonRows } = require('../embed-builder/renderer');
const { assertValidConfiguration } = require('../embed-builder/validators');
const managedMessageRepository = require('../database/repositories/managedMessageRepository');
const templateRepository = require('../database/repositories/templateRepository');
const { missingSendPermissions } = require('./permissionService');
const { filesForConfiguration } = require('./mediaAssetService');

const managedMessageLocks = new Map();

async function withManagedMessageLock(messageId, callback) {
  const previous = managedMessageLocks.get(messageId) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  managedMessageLocks.set(messageId, queued);
  await previous;
  try {
    return await callback();
  } finally {
    release();
    if (managedMessageLocks.get(messageId) === queued) managedMessageLocks.delete(messageId);
  }
}

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

  const message = await channel.send({ embeds: [toEmbed(configuration)], components: toButtonRows(configuration), files: filesForConfiguration(configuration) });
  const template = templateName ? templateRepository.findByName(guild.id, templateName) : null;
  return managedMessageRepository.save({
    guildId: guild.id,
    channelId: channel.id,
    messageId: message.id,
    templateId: template?.id || null,
    configuration,
  });
}

async function updateManagedMessage({ client, guildId, managedRecord, configuration, expectedUpdatedAt }) {
  assertValidConfiguration(configuration);
  if (managedRecord.guild_id !== guildId) throw new Error('That managed message does not belong to this server.');
  return withManagedMessageLock(managedRecord.id, async () => {
    const current = managedMessageRepository.findById(managedRecord.id);
    if (!current) throw new Error('That managed message is no longer tracked.');
    if (expectedUpdatedAt && current.updated_at !== expectedUpdatedAt) {
      throw new Error('This managed message was changed in another builder session. Reopen it before updating.');
    }

    let channel;
    let message;
    try {
      channel = await client.channels.fetch(current.channel_id);
      if (!channel?.messages) throw new Error('The original channel no longer exists or is no longer accessible.');
      message = await channel.messages.fetch(current.message_id);
    } catch (error) {
      if (error.message.includes('channel no longer')) throw error;
      throw new Error('I cannot fetch the original message. It may be deleted or I may lack View Channel/Read Message History permission.');
    }
    if (!message) throw new Error('The original message no longer exists.');
    if (message.author.id !== client.user.id) throw new Error('I will only edit messages created by this bot.');

    try {
      await message.edit({ embeds: [toEmbed(configuration)], components: toButtonRows(configuration), files: filesForConfiguration(configuration) });
    } catch {
      throw new Error('I could not edit the original message. Check that I still have View Channel, Send Messages, and Embed Links permission.');
    }

    const saved = managedMessageRepository.updateIfCurrent({
      id: current.id,
      guildId,
      channelId: channel.id,
      messageId: message.id,
      templateId: current.template_id,
      configuration,
      expectedUpdatedAt: current.updated_at,
    });
    if (saved) return saved;

    try {
      await message.edit({ embeds: [toEmbed(current.configuration)], components: toButtonRows(current.configuration), files: filesForConfiguration(current.configuration) });
    } catch {
      // The user receives a reconciliation warning below; do not hide the original persistence failure.
    }
    throw new Error('The message was edited but its tracking record changed at the same time. The bot restored the previous content when possible; reopen the message and try again.');
  });
}

module.exports = { sendConfiguration, updateManagedMessage };
