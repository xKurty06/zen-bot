async function execute(interaction) {
  await interaction.reply({
    ephemeral: true,
    content: [
      'Use `/embed create` to open the live builder.',
      'Builder sections: Content, Appearance, Media, Fields, Buttons, Settings.',
      'Save drafts as templates, preview them, send them to channels, and later edit tracked bot messages.',
      'Channel navigation buttons are Discord Link Buttons, so posted navigation keeps working while the bot is offline.',
    ].join('\n'),
  });
}

module.exports = { execute };
