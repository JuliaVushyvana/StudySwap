// Сторінка входу й реєстрації (auth.html). Вкладка обирається за хешем: #login або #register.
// Після успішного входу токен зберігається в StudySession, а користувач повертається на головну.

(function () {
  'use strict';

  const API_URL = 'http://localhost:3000'; // той самий, що й в app.js
  // Куди повернутися після входу: ?next=material.html?id=5 (лише наші сторінки, без чужих адрес)
  const next = new URLSearchParams(window.location.search).get('next') || '';
  const HOME = /^[a-z]+\.html(\?[\w=&%.-]*)?$/i.test(next) ? next : 'index.html';
  const RETRY = { retries: 2, baseDelayMs: 300, timeoutMs: 3500, jitter: true };

  const { fetchWithResilience, readError } = window.StudyHttp;
  const Session = window.StudySession;
  const $ = (id) => document.getElementById(id);

  // Уже увійшли — сторінка входу не потрібна
  if (Session.load()) {
    window.location.replace(HOME);
    return;
  }

  function showResult(text, ok) {
    $('authResult').textContent = text;
    $('authResult').className = `result ${ok ? 'ok' : 'bad'}`;
  }

  // ---------- Вкладки ----------
  const TABS = { login: 'loginForm', register: 'registerForm' };

  function showTab() {
    const tab = window.location.hash.slice(1) in TABS ? window.location.hash.slice(1) : 'login';
    document.querySelectorAll('.tab').forEach((t) => {
      const active = t.dataset.tab === tab;
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', String(active));
    });
    Object.entries(TABS).forEach(([name, formId]) => { $(formId).hidden = name !== tab; });
    document.title = `${tab === 'register' ? 'Реєстрація' : 'Вхід'} · StudySwap`;
    showResult('', true);
  }
  window.addEventListener('hashchange', showTab);
  showTab();

  // ---------- Запити ----------
  // Повідомлення для людини замість технічного коду
  const MESSAGES = {
    INVALID_CREDENTIALS: 'Неправильний логін або пароль',
    LOGIN_TAKEN: 'Такий логін уже зайнятий',
    NICKNAME_TAKEN: 'Такий нікнейм уже зайнятий',
    EMAIL_TAKEN: 'Акаунт із такою поштою вже існує',
    RATE_LIMITED: 'Забагато спроб, зачекайте кілька секунд',
  };
  const describe = (e) => {
    if (MESSAGES[e.code]) return MESSAGES[e.code];
    if (e.details) return e.details.map((d) => d.message).join('; ');
    return `${e.error}${e.code ? ` · ${e.code}` : ''} (requestId: ${e.requestId || 'немає'})`;
  };

  const post = (path, body, retry = RETRY) => fetchWithResilience(`${API_URL}${path}`, {
    method: 'POST', body: JSON.stringify(body), retry,
  });

  async function login(credentials) {
    const res = await post('/auth/login', credentials);
    if (!res.ok) throw await readError(res);
    Session.save(await res.json());
    window.location.href = HOME;
  }

  // Кнопку вимикаємо на час запиту, щоб не відправити форму двічі
  const onSubmit = (form, handler) => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      await handler(new FormData(form));
    } catch (e) {
      showResult(e.error ? describe(e) : `Сервер недоступний: ${e.message}`, false);
      btn.disabled = false;
    }
  });

  onSubmit($('loginForm'), (f) => login({ login: f.get('login').trim(), password: f.get('password') }));

  onSubmit($('registerForm'), async (f) => {
    const body = {
      nickname: f.get('nickname').trim(),
      login: f.get('login').trim(),
      email: f.get('email').trim(),
      password: f.get('password'),
      birthDate: f.get('birthDate'),
    };
    // Без автоматичних повторів: реєстрація не ідемпотентна, повтор дав би 409 замість успіху
    const res = await post('/auth/register', body, { ...RETRY, retries: 0 });
    if (res.status !== 201) throw await readError(res);
    showResult('Акаунт створено, входимо…', true);
    await login({ login: body.login, password: body.password }); // одразу входимо в новий акаунт
  });
}());
