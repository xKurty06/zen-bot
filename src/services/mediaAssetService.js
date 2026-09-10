const IMAGE_FILENAME = /^[a-f0-9-]{36}\.(?:jpg|png|webp|gif)$/i;

function attachmentFilename(value) {
  if (typeof value !== 'string' || !value.startsWith('attachment://')) return null;
  const filename = value.slice('attachment://'.length);
  return IMAGE_FILENAME.test(filename) ? filename : null;
}

function filesForConfiguration(configuration) {
  const embed = configuration?.embed || {};
  const assets = configuration?.mediaAssets || {};
  const filenames = new Set([
    attachmentFilename(embed.image),
    attachmentFilename(embed.thumbnail),
    attachmentFilename(embed.author?.iconUrl),
    attachmentFilename(embed.footer?.iconUrl),
  ].filter(Boolean));
  return [...filenames].map((name) => {
    const url = assets[name];
    if (!url) throw new Error('An uploaded image is no longer available. Please upload it again.');
    return { attachment: url, name };
  });
}

module.exports = { filesForConfiguration };
