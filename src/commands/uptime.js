function formatUptime(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);

  return parts.length ? parts.join(' ') : '0s';
}

async function execute(interaction) {
  const startedAt = interaction.client.uptimeStartedAt || Date.now();
  const uptime = Date.now() - startedAt;

  await interaction.reply({
    ephemeral: true,
    content: `Bot uptime: ${formatUptime(uptime)}`,
  });
}

module.exports = { execute, formatUptime };
