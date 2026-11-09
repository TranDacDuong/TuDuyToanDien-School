'use strict';

// A restored database can receive events without changing the real Zalo account.
// Keep the default unchanged for existing installations.
const MUTATION = /^(send|upload|create|add|remove|delete|change|update|undo|forward|join|leave|mute|unmute|block|unblock|accept|reject|invite|pin|unpin|set)/i;

function installReadOnly(api, enabled = false) {
  if (!enabled) return api;
  return new Proxy(api, {
    get(target, name) {
      const value = Reflect.get(target, name, target);
      if (typeof value !== 'function') return value;
      if (typeof name === 'string' && MUTATION.test(name)) {
        return async () => {
          const error = new Error('Bot đang ở chế độ chỉ đồng bộ; chưa bật gửi hoặc thay đổi trên Zalo.');
          error.code = 'ZALO_READ_ONLY';
          throw error;
        };
      }
      return value.bind(target);
    }
  });
}

module.exports = { installReadOnly };
