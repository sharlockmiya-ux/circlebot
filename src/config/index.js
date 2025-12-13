// src/config/index.js
const fs = require('fs');
const path = require('path');

function must(envKey) {
  const v = process.env[envKey];
  if (!v) {
    throw new Error(`[CONFIG] Missing required env: ${envKey}`);
  }
  return v;
}

function loadServerConfig() {
  const profile = process.env.SERVER_PROFILE || 'main';
  const filePath = path.join(__dirname, 'servers', `${profile}.json`);

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `[CONFIG] Server profile "${profile}" not found. Expected: ${filePath}`
    );
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const cfg = JSON.parse(raw);

  // --- fail fast: 必須キーの最低限チェック ---
  if (!cfg.guildId) throw new Error('[CONFIG] guildId is required in server config');

  if (!cfg.channels || !cfg.channels.log) {
    throw new Error('[CONFIG] channels.log is required in server config');
  }

  if (!cfg.roles || !cfg.roles.announcement) {
    throw new Error('[CONFIG] roles.announcement is required in server config');
  }

  return cfg;
}

module.exports = {
  must,
  loadServerConfig,
};
