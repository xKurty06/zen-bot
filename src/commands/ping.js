async function execute(interaction) {
  const sent = await interaction.reply({ content: 'Pinging...', ephemeral: true, fetchReply: true });
  await interaction.editReply(`Bot latency: ${sent.createdTimestamp - interaction.createdTimestamp}ms\nWebSocket latency: ${Math.round(interaction.client.ws.ping)}ms`);
}

module.exports = { execute };
