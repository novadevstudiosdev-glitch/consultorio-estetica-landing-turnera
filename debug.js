// Script para encontrar el archivo problemático
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (id) {
  try {
    return originalRequire.apply(this, arguments);
  } catch (err) {
    if (
      err.message.includes('export') ||
      err.message.includes('Invalid or unexpected token')
    ) {
      console.error('\n🔴 ERROR AL CARGAR:', id);
      console.error('📍 Desde:', this.filename);
      console.error('💥 Error:', err.message);
    }
    throw err;
  }
};

require('./dist/main');
