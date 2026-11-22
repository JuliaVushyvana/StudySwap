// Логіка сторінки: health, список, створення матеріалу, degraded mode і журнал запитів.

(function () {
  'use strict';

  const API_URL = 'http://localhost:3000';
  const HEALTH_TIMEOUT_MS = 1000; // якщо /health довше 1 с — AbortController відміняє запит
  const RETRY = { retries: 2, baseDelayMs: 300, timeoutMs: 3500, jitter: true };

  const { fetchWithResilience, readError } = window.StudyHttp;
  const { getOrReuseKey, forgetKey } = window.StudyIdem;
  const Session = window.StudySession;
  const $ = (id) => document.getElementById(id);

  // ---------- Журнал ----------
  function log(text, kind = '') {
    const line = document.createElement('div');
    if (kind) line.className = kind;
    line.textContent = `${new Date().toLocaleTimeString()}  ${text}`;
    $('log').prepend(line);
  }

  // Колбек для fetchWithResilience: пише кожну спробу
  const attemptLogger = (label) => ({ attempt, status, error, waitMs, requestId }) => {
    const rid = requestId.slice(0, 8);
    const what = error || `HTTP ${status}`;
    const kind = error || status >= 500 || status === 429 ? (waitMs ? 'warn' : 'bad') : 'ok';
    const next = waitMs ? ` → повтор через ${waitMs} мс` : '';
    log(`${label} спроба ${attempt + 1}: ${what} [rid ${rid}]${next}`, kind);
  };

  // ---------- Degraded mode ----------
  async function checkHealth() {
    try {
      const res = await fetchWithResilience(`${API_URL}/health`, {
        retry: { retries: 0, timeoutMs: HEALTH_TIMEOUT_MS },
        onAttempt: attemptLogger('GET /health'),
      });
      // Очікуємо { "status": "ok" }; старий бекенд відповідав текстом "ok"
      const text = await res.text();
      let ok = res.ok && text.trim() === 'ok';
      try { ok = res.ok && JSON.parse(text).status === 'ok'; } catch (_) { /* не JSON */ }
      setHealth(ok, ok ? 'Сервер: ok' : `Сервер: HTTP ${res.status}`);
      return ok;
    } catch (e) {
      setHealth(false, `Сервер: ${e.message}`);
      return false;
    }
  }

  function setHealth(ok, text) {
    $('healthDot').className = `dot ${ok ? 'ok' : 'bad'}`;
    $('healthText').textContent = text;
  }

  let countdown = null;
  let wasDegraded = false;
  const degraded = window.StudyDegraded.createDegradedMode({
    threshold: 3,
    cooldownMs: 10000,
    probe: checkHealth,
    onChange({ degraded: on, untilTs }) {
      if (on === wasDegraded && !on) return; // просто змінився лічильник збоїв
      document.querySelectorAll('[data-api]').forEach((b) => { b.disabled = on; });
      $('banner').classList.toggle('show', on);
      clearInterval(countdown);
      if (on) {
        if (!wasDegraded) {
          log('DEGRADED MODE: 3 збої поспіль, кнопки вимкнено', 'bad');
          setHealth(false, 'Сервер: збої');
        }
        wasDegraded = true;
        const tick = () => {
          const s = Math.max(0, Math.ceil((untilTs - Date.now()) / 1000));
          $('bannerText').textContent = `Сервер перевантажено або недоступний. Кнопки вимкнено, перевірка через ${s} с.`;
        };
        tick();
        countdown = setInterval(tick, 500);
      } else {
        wasDegraded = false;
        log('Сервер знову доступний, звичайний режим', 'ok');
      }
    },
  });

  // Будь-який запит до API проходить тут: рахуємо успіхи/збої для degraded mode
  async function callApi(label, url, opts = {}) {
    try {
      const res = await fetchWithResilience(url, { retry: RETRY, onAttempt: attemptLogger(label), ...opts });
      if (res.status >= 500 || res.status === 429) degraded.failure();
      else degraded.success();
      return res;
    } catch (e) {
      degraded.failure();
      throw e;
    }
  }

  const describeError = (e) => {
    const parts = [e.error];
    if (e.code) parts.push(e.code);
    if (e.details) parts.push(e.details.map((d) => `${d.field}: ${d.message}`).join('; '));
    return `${parts.join(' — ')} (requestId: ${e.requestId || '—'})`;
  };

  // ---------- Список матеріалів (таблиця) ----------
  const cell = (text, cls) => {
    const td = document.createElement('td');
    if (cls) td.className = cls;
    td.textContent = text;
    return td;
  };
  const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString('uk-UA') : '—');

  function renderRows(items) {
    const tbody = $('list');
    tbody.innerHTML = '';
    if (items.length === 0) {
      const tr = document.createElement('tr');
      tr.className = 'empty';
      const td = cell('Нічого не знайдено');
      td.colSpan = 7;
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    items.forEach((m) => {
      const tr = document.createElement('tr');
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = m.type;
      const typeTd = cell('');
      typeTd.appendChild(chip);
      tr.append(
        cell(m.title, 'title'), cell(m.subject), cell(String(m.course)), cell(m.university || '—'),
        typeTd, cell(m.authorNickname || '—'), cell(formatDate(m.createdAt)),
      );
      tbody.appendChild(tr);
    });
  }

  async function loadMaterials() {
    $('listError').textContent = '';
    const q = $('searchInput').value.trim();
    const url = `${API_URL}/materials${q ? `?q=${encodeURIComponent(q)}` : ''}`;
    try {
      const res = await callApi(`GET /materials${q ? `?q=${q}` : ''}`, url);
      if (!res.ok) {
        $('listError').textContent = `Не вдалося завантажити: ${describeError(await readError(res))}`;
        return;
      }
      const { items } = await res.json();
      renderRows(items);
    } catch (e) {
      $('listError').textContent = `Не вдалося завантажити: ${e.message} (requestId: ${e.requestId})`;
    }
  }

  $('searchForm').addEventListener('submit', (event) => {
    event.preventDefault();
    loadMaterials();
  });

  // ---------- Акаунт: шапка й вихід (вхід і реєстрація — на auth.html) ----------
  let session = Session.load();

  function renderSession() {
    const user = session && session.user;
    $('guestLinks').hidden = Boolean(user);
    $('account').hidden = !user;
    if (user) {
      $('accountName').textContent = user.role === 'admin' ? `${user.nickname} (адмін)` : user.nickname;
      $('accountAvatar').textContent = user.nickname.charAt(0).toUpperCase();
    }
    $('authorHint').innerHTML = '';
    if (user) {
      $('authorHint').textContent = `Від імені: ${user.nickname}`;
    } else {
      $('authorHint').append('Щоб додати матеріал, ');
      const link = document.createElement('a');
      link.href = 'auth.html#login';
      link.textContent = 'увійдіть або зареєструйтесь';
      $('authorHint').append(link, '.');
    }
  }

  function dropSession(reason) {
    Session.clear();
    session = null;
    renderSession();
    if (reason) showResult(reason, false);
  }

  $('logoutBtn').addEventListener('click', async () => {
    const { token } = session || {};
    try {
      const res = await callApi('POST /auth/logout', `${API_URL}/auth/logout`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status !== 204 && res.status !== 401) throw await readError(res);
    } catch (e) {
      // Локально виходимо в будь-якому разі; на сервері токен сам згасне після строку дії
      log(`Вихід: сервер не підтвердив (${e.message || e.code})`, 'warn');
    }
    dropSession();
    log('Вихід з акаунта', 'ok');
  });

  renderSession();

  // ---------- Створення матеріалу ----------
  function readForm() {
    const f = new FormData($('createForm'));
    const payload = {
      title: f.get('title').trim(),
      subject: f.get('subject').trim(),
      university: f.get('university').trim(),
      course: Number(f.get('course')),
      type: f.get('type'),
      fileId: f.get('fileId').trim(),
    };
    const description = f.get('description').trim();
    if (description) payload.description = description; // поле необов'язкове за контрактом
    return { payload, token: session && session.token };
  }

  async function postMaterial(payload, token, idempotencyKey, label = 'POST /materials') {
    const res = await callApi(label, `${API_URL}/materials`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(payload),
      idempotencyKey,
    });
    if (res.status === 401 && token) dropSession('Сесія завершилась — увійдіть знову'); // токен прострочено або відкликано
    return res;
  }

  function showResult(text, ok) {
    $('createResult').textContent = text;
    $('createResult').className = `result ${ok ? 'ok' : 'bad'}`;
  }

  $('createForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitBtn = event.submitter || $('createForm').querySelector('[type=submit]');
    submitBtn.disabled = true; // захист від подвійного кліку на рівні UI
    const { payload, token } = readForm();
    const key = await getOrReuseKey(payload);
    log(`Idempotency-Key ${key.slice(0, 8)}… для цих даних`);
    try {
      const res = await postMaterial(payload, token, key);
      if (res.status === 201) {
        const m = await res.json();
        // Заголовок видно браузеру, лише якщо бекенд віддає Access-Control-Expose-Headers: X-Request-Id
        const rid = res.headers.get('X-Request-Id') || m.requestId || '—';
        showResult(`Створено матеріал #${m.id} «${m.title}» (requestId: ${rid})`, true);
        loadMaterials(); // новий матеріал одразу з'являється в таблиці
      } else {
        const err = await readError(res);
        if (res.status >= 400 && res.status < 500 && res.status !== 429) await forgetKey(payload);
        showResult(`Помилка ${res.status}: ${describeError(err)}`, false);
      }
    } catch (e) {
      // Ключ лишаємо: повторне натискання з тими ж даними не створить дубль
      showResult(`Не вдалося: ${e.message} (requestId: ${e.requestId}). Натисніть ще раз — дубля не буде.`, false);
    } finally {
      if (!degraded.isDegraded()) submitBtn.disabled = false;
    }
  });

  // Демонстрація: два однакові POST одночасно з тим самим ключем → однаковий id
  $('doubleBtn').addEventListener('click', async () => {
    const { payload, token } = readForm();
    const key = await getOrReuseKey(payload);
    log(`Демо: 2 паралельні POST з Idempotency-Key ${key.slice(0, 8)}…`);
    try {
      const [a, b] = await Promise.all([
        postMaterial(payload, token, key, 'POST #1'),
        postMaterial(payload, token, key, 'POST #2'),
      ]);
      const [ja, jb] = await Promise.all([a.json().catch(() => ({})), b.json().catch(() => ({}))]);
      const same = a.status === 201 && b.status === 201 && ja.id === jb.id;
      showResult(
        `Відповіді: ${a.status} (id ${ja.id ?? '—'}) і ${b.status} (id ${jb.id ?? '—'}) — `
        + (same ? 'той самий матеріал, дубля немає ✔' : 'різні результати: бекенд ще не підтримує Idempotency-Key'),
        same,
      );
    } catch (e) {
      showResult(`Не вдалося: ${e.message}`, false);
    }
  });

  $('healthBtn').addEventListener('click', checkHealth);
  $('retryNowBtn').addEventListener('click', () => degraded.retryNow());

  checkHealth().then((ok) => { if (ok) loadMaterials(); });
}());
