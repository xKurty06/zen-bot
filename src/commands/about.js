async function execute(interaction) {
  await interaction.reply({
    ephemeral: true,
    content: 'Zen Bot is a locally hosted Discord embed builder and server content manager. It stores templates in SQLite and is designed to be started only when administrators need to create or update content.',
  });
}

module.exports = { execute };
