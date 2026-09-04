# Zen Bot

Zen Bot is a locally hosted Discord.js bot for building and maintaining server information embeds. It acts like a Discord-native embed CMS: start it locally, create or update content, publish the message, then stop the bot.

Previously posted messages remain visible when the bot is offline. Navigation buttons are Discord Link Buttons, including channel navigation links like `https://discord.com/channels/GUILD_ID/CHANNEL_ID`, so simple navigation keeps working without bot interactions.

## Features

- Interactive `/embed create` live-preview builder
- Modal editors for title, description, URLs, author, footer, color, media, fields, and buttons
- Field add/edit/remove/reorder
- Link button add/edit/remove/reorder
- Discord channel buttons through channel selectors
- External HTTPS URL buttons with validation
- SQLite template persistence
- Template list, preview, save, duplicate, delete, and info commands
- Send templates to selected channels and track managed messages
- Edit previously posted messages created by this bot
- `/ping`, `/help`, and `/about`
- Graceful shutdown for local start/stop usage

## Requirements

- Node.js 20 or newer
- A Discord application and bot token
- Permission to add the bot to your server

## Installation

```bash
npm install
```

## Environment Setup

Create `.env` from `.env.example`:

```env
DISCORD_TOKEN=
CLIENT_ID=
GUILD_ID=
DATABASE_PATH=
```

`GUILD_ID` is recommended for local development because guild commands update quickly. `DATABASE_PATH` is optional and defaults to `data/bot.sqlite`.

Never commit `.env`. It is ignored by git.

## Discord Developer Portal Setup

1. Create an application in the Discord Developer Portal.
2. Add a bot user and copy the token into `DISCORD_TOKEN`.
3. Copy the application ID into `CLIENT_ID`.
4. Invite the bot with `applications.commands` and `bot` scopes.
5. Grant only the permissions needed for your workflow: View Channel, Send Messages, Embed Links, and Read Message History. Attach Files is only needed if you later extend media upload handling.

## Command Deployment

```bash
npm run deploy-commands
```

Commands are deployed automatically every time the bot starts. You can also run the deployment command separately when needed.

## Starting

```bash
npm start
```

## Development

```bash
npm run dev
```

## Core Commands

- `/embed create [name]` opens the live builder
- `/embed edit type:Template name:<name>` edits a template
- `/embed edit type:Posted Message message_id:<id>` edits a tracked bot message
- `/embed save name:<name>` saves the latest active draft
- `/embed list` lists templates
- `/embed preview name:<name>` previews a template with real link buttons
- `/embed send name:<name> channel:#channel` posts and tracks a template
- `/embed duplicate from:<name> to:<name>` duplicates a template
- `/embed delete name:<name>` asks for confirmation and deletes a template
- `/embed info name:<name>` or `/embed info message_id:<id>` shows metadata

## Offline Behavior

The bot is designed for local administration sessions, not 24/7 automation.

Slash commands, modals, selects, and builder controls require the bot to be running. Published embeds remain normal Discord messages when the bot is offline. Navigation buttons are stored as Discord Link Buttons, so channel navigation and external links continue to work after shutdown.

Bot-dependent custom buttons are used only inside the ephemeral admin builder. They are not used for public navigation.

## Notes And Limitations

Discord attachments can produce URLs that may not be suitable as permanent template media. This implementation stores image URLs explicitly and validates them, instead of silently saving temporary attachment links as durable content.

Managed-message editing only updates a selected tracked message. Saving a template does not automatically update every message created from it.
