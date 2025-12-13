// src/core/processGuards.js
function installProcessGuards() {
  process.on('unhandledRejection', (err) => {
    console.error('unhandledRejection:', err);
  });

  process.on('uncaughtException', (err) => {
    console.error('uncaughtException:', err);
  });
}

module.exports = { installProcessGuards };
