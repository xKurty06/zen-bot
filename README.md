# Zen Bot

Zen Bot is a locally hosted Discord.js bot for building and maintaining server information embeds. It acts like a Discord-native embed CMS: start it locally, create or update content, publish the message, then stop the bot.

Previously posted messages remain visible when the bot is offline. Navigation buttons are Discord Link Buttons, including channel navigation links like `https://discord.com/channels/GUILD_ID/CHANNEL_ID`, so simple navigation keeps working without bot interactions.

## Features

- Interactive `/embed create` live-preview builder
- Normal Discord message content above embeds, including Markdown, line breaks, emojis, and selected user/role/channel mentions
- Modal editors for title, description, URLs, author, footer, color, media, fields, and buttons
- Field add/edit/remove/reorder
- Link button add/edit/remove/reorder
- Discord channel buttons through channel selectors
- External HTTPS URL buttons with validation
- SQLite template persistence
- Template list, preview, save, duplicate, delete, and info commands
- Send templates to selected channels and track managed messages
- Edit previously posted messages created by this bot
- `/ping`, `/help`, `/about`, `/uptime`, and `/checksync`
- `/notify`, `/notifytest`, and `/rolecount` for role-holder milestone tracking
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
4. Enable the **Server Members Intent** if you use `/notify` or `/rolecount`; accurate role-holder counts require member data.
5. Invite the bot with `applications.commands` and `bot` scopes.
6. Grant only the permissions needed for your workflow: View Channel, Send Messages, Embed Links, and Read Message History. Attach Files is only needed if you later extend media upload handling.

For `/checksync`, the bot must be able to view every category and child channel you want included in the report. The command is available by default to members with **Manage Channels** (and also accepts administrators or members with Manage Server at runtime).

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
- `/checksync` checks category child-channel permission overwrites and reports the roles or users that differ
- `/notify create role:@Role target:100 channel:#updates ping:@User` creates a role-holder milestone notification
- `/notify list` lists notification configurations
- `/notify view id:<id>` shows a configuration and current holder count
- `/notify edit id:<id> [role] [target] [channel] [ping]` edits a configuration without resetting milestone progress
- `/notify enable id:<id>` and `/notify disable id:<id>` toggle a configuration
- `/notify reset id:<id>` clears milestone progress and starts a new notification cycle
- `/notify delete id:<id>` removes a configuration
- `/notifytest [id]` sends a test notification without changing milestone progress
- `/rolecount role:@Role` counts current human members with a role

## Message Content In The Builder

The `/embed create` builder has a **Content** section for regular Discord message content. This is the message `content` field, not the embed description, so the final Discord message is sent as one payload containing message content, embeds, and link buttons.

Message content supports normal text, multiple paragraphs, line breaks, Discord Markdown, emojis, and real user, role, and channel mentions. Use the Content section selectors to insert mentions without typing IDs:

- Role selector inserts `<@&ROLE_ID>`
- User selector inserts `<@USER_ID>`
- Channel selector inserts `<#CHANNEL_ID>`

The live builder shows message content above the embed preview. Saved templates, duplicated templates, sent messages, and managed-message edits preserve the message content. Existing templates without content still load with empty message content.

For safety, final send/edit payloads use restricted `allowedMentions`: only user and role IDs present in the saved content are allowed to ping, and `@everyone` / `@here` are neutralized. Template preview suppresses pings.

## Role Notifications

`/notify` monitors how many human members currently have a selected role. Bots are not counted. The bot refreshes member data when checking counts, and configurations are scoped per server.

Milestones are static relative to the configured target:

- Target 100: 80 holders sends the 20-away alert
- Target 100: 90 holders sends the 10-away alert
- Target 100: 95 holders sends the 5-away alert
- Target 100: 100 holders sends the target reached alert

For target 500, the same static offsets become 480, 490, 495, and 500.

Each milestone triggers once per notification cycle and is stored in SQLite, so already-sent alerts remain recorded after restart. Counts moving backward do not automatically reset progress; use `/notify reset id:<id>` when you intentionally want a fresh cycle.

`/notifytest` sends the configured notification appearance to the configured channel regardless of the current count. It does not mark milestones, reset progress, or change configuration.

Notification configuration and test commands require the same management permission path as embed administration. `/rolecount` follows the permission-sync convention and requires Manage Channels, Manage Server, or Administrator.

## Offline Behavior

The bot is designed for local administration sessions, not 24/7 automation.

Slash commands, modals, selects, and builder controls require the bot to be running. Published embeds remain normal Discord messages when the bot is offline. Navigation buttons are stored as Discord Link Buttons, so channel navigation and external links continue to work after shutdown.

Bot-dependent custom buttons are used only inside the ephemeral admin builder. They are not used for public navigation.

Role notifications, `/notifytest`, and `/rolecount` require the bot to be online. Saved notification configurations and milestone state are restored from SQLite after restart, but automatic notification checks only run when Discord sends a new member join event.

## Notes And Limitations

Discord attachments can produce URLs that may not be suitable as permanent template media. This implementation stores image URLs explicitly and validates them, instead of silently saving temporary attachment links as durable content.

Managed-message editing only updates a selected tracked message. Saving a template does not automatically update every message created from it.

Role notification checks run only when a new member joins the server. The bot does not poll, run timers, or react to role assignment/removal events for `/notify`.
