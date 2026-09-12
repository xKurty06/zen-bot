const crypto = require('node:crypto');

function emptyConfiguration() {
  return {
    content: '',
    embed: {
      title: '',
      description: '',
      url: '',
      color: null,
      author: {},
      footer: {},
      thumbnail: '',
      image: '',
      fields: [],
      timestamp: false,
    },
    buttons: [],
    mediaAssets: {},
  };
}

class BuilderSession {
  constructor({ guildId, userId, templateName = '', configuration = emptyConfiguration(), mode = 'template', managedMessageId = null, managedMessageUpdatedAt = null, saved = false }) {
    this.id = crypto.randomUUID();
    this.guildId = guildId;
    this.userId = userId;
    this.templateName = templateName;
    this.configuration = { ...emptyConfiguration(), ...configuration, embed: { ...emptyConfiguration().embed, ...(configuration.embed || {}) }, buttons: configuration.buttons || [], mediaAssets: configuration.mediaAssets || {} };
    this.mode = mode;
    this.managedMessageId = managedMessageId;
    this.managedMessageUpdatedAt = managedMessageUpdatedAt;
    this.section = 'home';
    this.pending = {};
    this.mediaDirty = Boolean(configuration?.mediaAssets && Object.keys(configuration.mediaAssets).length);
    this.revision = 0;
    this.createdAt = new Date();
    this.lastActivityAt = new Date();
    this.saved = saved;
  }

  touch() {
    this.lastActivityAt = new Date();
  }

  transition(section) {
    this.section = section;
    this.pending = {};
    this.revision += 1;
    this.touch();
  }

  changed() {
    this.saved = false;
    this.revision += 1;
    this.touch();
  }
}

module.exports = { BuilderSession, emptyConfiguration };
