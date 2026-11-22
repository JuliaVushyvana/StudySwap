// Сесія користувача: токен доступу з POST /auth/login і дані акаунта.
// Зберігається в localStorage, тож вхід переживає оновлення сторінки.
// Прострочений токен відкидається одразу при читанні, без запиту до сервера.

(function (global) {
  'use strict';

  const KEY = 'studyswap:session';

  // Сховище може бути недоступне (приватний режим, file:// у деяких браузерах) — тоді пам'ять
  let memory = null;
  const store = {
    get() { try { return global.localStorage.getItem(KEY); } catch (_) { return memory; } },
    set(v) { try { global.localStorage.setItem(KEY, v); } catch (_) { memory = v; } },
    remove() { try { global.localStorage.removeItem(KEY); } catch (_) { memory = null; } },
  };

  // login — відповідь POST /auth/login: { accessToken, tokenType, expiresIn, user }
  function save(login) {
    const session = { token: login.accessToken, user: login.user, expiresAt: Date.now() + login.expiresIn * 1000 };
    store.set(JSON.stringify(session));
    return session;
  }

  // { token, user, expiresAt } або null, якщо входу не було чи токен прострочено
  function load() {
    let session = null;
    try { session = JSON.parse(store.get()); } catch (_) { /* зіпсований запис */ }
    if (!session || !session.token || !(session.expiresAt > Date.now())) {
      if (session) store.remove();
      return null;
    }
    return session;
  }

  global.StudySession = { save, load, clear: store.remove };
}(window));
