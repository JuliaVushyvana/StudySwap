// Логіка сторінок StudySwap.
// Спільне для всіх: шапка з акаунтом і роллю, /health, degraded mode, журнал запитів.
// index.html — пошук і таблиця; add.html — додавання матеріалу; material.html — сторінка матеріалу.
// Що дозволено кожній ролі (гість / користувач / адмін) — lib/permissions.js.

(function () {
  'use strict';

  const API_URL = 'http://localhost:3000';
  const HEALTH_TIMEOUT_MS = 1000; // якщо /health довше 1 с — AbortController відміняє запит
  const RETRY = { retries: 2, baseDelayMs: 300, timeoutMs: 3500, jitter: true };

  const { fetchWithResilience, readError } = window.StudyHttp;
  const { getOrReuseKey, forgetKey } = window.StudyIdem;
  const Session = window.StudySession;
  const Access = window.StudyAccess;
  const P = Access.Permission;
  const $ = (id) => document.getElementById(id);
  const page = document.body.dataset.page;

  // ---------- Журнал запитів: лише в консоль браузера (F12), на сторінці не показується ----------
  function log(text, kind = '') {
    const method = kind === 'bad' ? 'warn' : 'debug';
    console[method](`[StudySwap] ${text}`);
  }

  const attemptLogger = (label) => ({ attempt, status, error, waitMs, requestId }) => {
    const rid = requestId.slice(0, 8);
    const what = error || `HTTP ${status}`;
    const kind = error || status >= 500 || status === 429 ? (waitMs ? 'warn' : 'bad') : 'ok';
    const next = waitMs ? ` → повтор через ${waitMs} мс` : '';
    log(`${label} спроба ${attempt + 1}: ${what} [rid ${rid}]${next}`, kind);
  };

  // ---------- /health і degraded mode ----------
  // Стан сервера на сторінці не показуємо: /health потрібен лише для виходу з degraded mode
  function setHealth(ok, text) {
    log(text, ok ? 'ok' : 'bad');
  }

  async function checkHealth() {
    try {
      const res = await fetchWithResilience(`${API_URL}/health`, {
        retry: { retries: 0, timeoutMs: HEALTH_TIMEOUT_MS },
        onAttempt: attemptLogger('GET /health'),
      });
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

  let countdown = null;
  let wasDegraded = false;
  const degraded = window.StudyDegraded.createDegradedMode({
    threshold: 3,
    cooldownMs: 10000,
    probe: checkHealth,
    onChange({ degraded: on, untilTs }) {
      if (on === wasDegraded && !on) return;
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

  // ---------- Акаунт і рівень доступу ----------
  let session = Session.load();
  const currentUser = () => (session ? session.user : null);
  const authHeaders = () => (session ? { Authorization: `Bearer ${session.token}` } : {});

  // Гостя ведемо на вхід і після входу повертаємо туди, де він був
  const loginUrl = () => `auth.html?next=${encodeURIComponent(location.pathname.split('/').pop() + location.search)}#login`;

  function renderSession() {
    const user = currentUser();
    $('guestLinks').hidden = Boolean(user);
    $('account').hidden = !user;
    document.body.dataset.role = Access.roleOf(user);
    if (user) {
      $('accountName').textContent = user.nickname;
      $('accountAvatar').textContent = user.nickname.charAt(0).toUpperCase();
      $('accountRole').textContent = Access.label(user);
      $('accountRole').className = `role-badge role-${Access.roleOf(user)}`;
    }
  }

  function dropSession() {
    Session.clear();
    session = null;
    renderSession();
  }

  $('logoutBtn').addEventListener('click', async () => {
    try {
      const res = await callApi('POST /auth/logout', `${API_URL}/auth/logout`, { method: 'POST', headers: authHeaders() });
      if (res.status !== 204 && res.status !== 401) throw await readError(res);
    } catch (e) {
      log(`Вихід: сервер не підтвердив (${e.message || e.code})`, 'warn');
    }
    dropSession();
    log('Вихід з акаунта', 'ok');
    if (page !== 'home') location.href = 'index.html';
    else loadMaterials();
  });

  // ---------- Запити до API ----------
  async function callApi(label, url, opts = {}) {
    try {
      const res = await fetchWithResilience(url, { retry: RETRY, onAttempt: attemptLogger(label), ...opts });
      if (res.status >= 500 || res.status === 429) degraded.failure();
      else degraded.success();
      // Токен прострочено або відкликано — сесія більше не дійсна
      if (res.status === 401 && session && opts.headers && opts.headers.Authorization) {
        dropSession();
        log('Сесія завершилась — потрібно увійти знову', 'warn');
      }
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
    return `${parts.join(' · ')} (requestId: ${e.requestId || 'немає'})`;
  };

  async function deleteMaterial(m) {
    if (!window.confirm(`Видалити «${m.title}»?`)) return false;
    const res = await callApi(`DELETE /materials/${m.id}`, `${API_URL}/materials/${m.id}`, { method: 'DELETE', headers: authHeaders() });
    if (res.status === 204) { log(`Матеріал #${m.id} видалено`, 'ok'); return true; }
    const err = await readError(res);
    window.alert(res.status === 403 ? 'Недостатньо прав: видаляти можна лише свої матеріали' : describeError(err));
    return false;
  }

  // ---------- Головна: пошук і таблиця ----------
  const cell = (text, cls) => {
    const td = document.createElement('td');
    if (cls) td.className = cls;
    td.textContent = text;
    return td;
  };
  const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString('uk-UA') : '—');

  // Сторінку матеріалу бачать усі; файл на ній — лише після входу
  function titleCell(m) {
    const td = cell('', 'title');
    td.appendChild(Object.assign(document.createElement('a'), { href: `material.html?id=${m.id}`, textContent: m.title }));
    return td;
  }

  function actionsCell(m) {
    const td = cell('', 'actions');
    if (Access.canManageMaterial(currentUser(), m, 'delete')) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-danger btn-xs';
      btn.textContent = 'Видалити';
      btn.dataset.api = '';
      btn.addEventListener('click', async () => { if (await deleteMaterial(m)) loadMaterials(); });
      td.appendChild(btn);
    }
    return td;
  }

  function renderRows(items) {
    const tbody = $('list');
    tbody.innerHTML = '';
    if (items.length === 0) {
      const tr = document.createElement('tr');
      tr.className = 'empty';
      const td = cell('Нічого не знайдено');
      td.colSpan = 8;
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    items.forEach((m) => {
      const tr = document.createElement('tr');
      const chip = Object.assign(document.createElement('span'), { className: 'chip', textContent: m.type });
      const typeTd = cell('');
      typeTd.appendChild(chip);
      tr.append(
        titleCell(m), cell(m.subject), cell(String(m.course)), cell(m.university || '—'),
        typeTd, cell(m.authorNickname || '—'), cell(formatDate(m.createdAt)), actionsCell(m),
      );
      tbody.appendChild(tr);
    });
  }

  async function loadMaterials() {
    if (!$('list')) return;
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

  if (page === 'home') {
    $('searchForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const q = $('searchInput').value.trim();
      history.replaceState(null, '', q ? `?q=${encodeURIComponent(q)}` : location.pathname);
      loadMaterials();
    });
    const q = new URLSearchParams(location.search).get('q');
    if (q) $('searchInput').value = q;
  }

  // ---------- Сторінка «Додати матеріал» ----------
  function showResult(text, ok) {
    $('createResult').textContent = text;
    $('createResult').className = `result ${ok ? 'ok' : 'bad'}`;
  }

  function readForm() {
    const f = new FormData($('createForm'));
    const payload = {
      title: f.get('title').trim(),
      subject: f.get('subject').trim(),
      university: f.get('university').trim(),
      course: Number(f.get('course')),
      type: f.get('type'),
    };
    const description = f.get('description').trim();
    if (description) payload.description = description;
    return payload;
  }

  const postMaterial = (payload, idempotencyKey) => callApi('POST /materials', `${API_URL}/materials`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify(payload), idempotencyKey,
  });

  function renderAddPage() {
    const allowed = Access.can(currentUser(), P.MATERIAL_CREATE);
    $('createCard').hidden = !allowed;
    $('lockedCard').hidden = allowed;
    if (!allowed) $('lockedLogin').href = loginUrl();
  }

  // ---------- Файл: вибір, перевірка, завантаження (POST /files) ----------
  const MB = 1024 * 1024;
  // Ті самі ліміти, що на сервері (business_doc.md, вимога №9) — щоб не вантажити зайве
  const FORMAT_LIMITS = {
    pdf: 50, doc: 20, docx: 20, txt: 20, ppt: 50, pptx: 50, zip: 50, mp3: 30, wav: 30, mp4: 100,
  };
  const UPLOAD_RETRY = { retries: 1, baseDelayMs: 500, timeoutMs: 120000, jitter: true }; // великі файли вантажаться довше

  // selected — обраний файл; uploaded — результат POST /files для нього (щоб не вантажити вдруге при повторі)
  let selected = null;
  let uploaded = null;

  function checkFile(file) {
    const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
    const limit = FORMAT_LIMITS[ext];
    if (!limit) return `Формат${ext ? ` .${ext}` : ''} не підтримується. Можна: ${Object.keys(FORMAT_LIMITS).join(', ')}`;
    if (file.size > limit * MB) return `Файл .${ext} має бути не більший за ${limit} МБ`;
    if (!file.size) return 'Файл порожній';
    return null;
  }

  const formatSize = (bytes) => (bytes >= MB ? `${(bytes / MB).toFixed(1)} МБ` : `${Math.max(1, Math.round(bytes / 1024))} КБ`);

  function selectFile(file) {
    const zone = $('dropzone');
    if (!file) return;
    const problem = checkFile(file);
    zone.classList.toggle('has-file', !problem);
    zone.classList.toggle('has-error', Boolean(problem));
    if (problem) {
      selected = null;
      $('dzTitle').textContent = file.name;
      $('dzHint').textContent = problem;
      return;
    }
    selected = file;
    uploaded = null;
    $('dzTitle').textContent = `📄 ${file.name}`;
    $('dzHint').textContent = `${formatSize(file.size)} · натисніть, щоб замінити`;
  }

  function resetFile() {
    selected = null;
    uploaded = null;
    $('fileInput').value = '';
    $('dropzone').classList.remove('has-file', 'has-error');
    $('dzTitle').innerHTML = 'Перетягни файл сюди або <u>обери на пристрої</u>';
    $('dzHint').textContent = 'PDF, Word, TXT, PowerPoint, ZIP до 20–50 МБ · аудіо до 30 МБ · відео до 100 МБ';
  }

  async function uploadFile(file) {
    const res = await callApi('POST /files', `${API_URL}/files`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
      body: file,
      retry: UPLOAD_RETRY,
    });
    if (res.status !== 201) throw Object.assign(await readError(res), { status: res.status });
    return res.json();
  }

  function setupDropzone() {
    const zone = $('dropzone');
    $('fileInput').addEventListener('change', (e) => selectFile(e.target.files[0]));
    ['dragenter', 'dragover'].forEach((t) => zone.addEventListener(t, (e) => { e.preventDefault(); zone.classList.add('dragging'); }));
    ['dragleave', 'drop'].forEach((t) => zone.addEventListener(t, (e) => { e.preventDefault(); zone.classList.remove('dragging'); }));
    zone.addEventListener('drop', (e) => selectFile(e.dataTransfer.files[0]));
  }

  // Предмети й заклади освіти для списків: базові + ті, що вже є в каталозі
  const BASE_SUBJECTS = [
    'Алгоритми', 'Архітектура ПЗ', 'Бази даних', 'Вебпрограмування', 'Вища математика',
    'Дискретна математика', 'Комп’ютерні мережі', 'ООП', 'Операційні системи', 'Фізика',
  ];
  const BASE_UNIVERSITIES = ['КНУ', 'КПІ', 'ЛНУ ім. Франка', 'ХНУ'];

  async function fillFromCatalog(subjectCombo, universityCombo) {
    try {
      const res = await callApi('GET /materials (для списків)', `${API_URL}/materials`);
      if (!res.ok) return;
      const { items } = await res.json();
      subjectCombo.setOptions(items.map((m) => m.subject));
      universityCombo.setOptions(items.map((m) => m.university));
    } catch (_) { /* лишаються базові списки */ }
  }

  if (page === 'add') {
    renderAddPage();
    setupDropzone();
    const subjectCombo = window.StudyCombobox.attach($('subjectInput'), { options: BASE_SUBJECTS, newLabel: 'Новий предмет', otherLabel: 'Інше (свій варіант)', otherPlaceholder: 'Впишіть свій предмет' });
    const universityCombo = window.StudyCombobox.attach($('universityInput'), { options: BASE_UNIVERSITIES, newLabel: 'Новий заклад освіти', otherLabel: 'Інший (свій варіант)', otherPlaceholder: 'Впишіть свій заклад освіти' });
    window.StudyCombobox.attach($('courseInput'), {
      options: ['1 курс', '2 курс', '3 курс', '4 курс', '5 курс', '6 курс'],
      strict: true,
      onSelect: (label) => { $('courseValue').value = String(parseInt(label, 10)); },
    });
    if (Access.can(currentUser(), P.MATERIAL_CREATE)) fillFromCatalog(subjectCombo, universityCombo);

    $('createForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!selected) {
        $('dropzone').classList.add('has-error');
        showResult('Додайте файл матеріалу', false);
        return;
      }
      // Кнопка вимкнена на час запиту — подвійний клік не надішле форму двічі
      const submitBtn = event.submitter || $('createForm').querySelector('[type=submit]');
      submitBtn.disabled = true;
      try {
        if (!uploaded) {
          showResult('Завантажуємо файл…', true);
          uploaded = await uploadFile(selected);
          log(`Файл ${uploaded.fileName} завантажено (${uploaded.id})`, 'ok');
        }
        const payload = { ...readForm(), fileId: uploaded.id };
        const key = await getOrReuseKey(payload); // повтор із тими самими даними не створить дубль
        const res = await postMaterial(payload, key);
        if (res.status === 201) {
          const m = await res.json();
          showResult(`Матеріал «${m.title}» додано. `, true);
          $('createResult').append(Object.assign(document.createElement('a'), { href: `material.html?id=${m.id}`, className: 'result-link', textContent: 'Відкрити матеріал →' }));
          $('createForm').reset();
          $('courseInput').value = '3 курс';
          $('courseValue').value = '3';
          resetFile();
        } else if (res.status === 401) {
          renderAddPage(); // сесія завершилась — показуємо заклик увійти
        } else {
          const err = await readError(res);
          if (res.status >= 400 && res.status < 500 && res.status !== 429) await forgetKey(payload);
          showResult(`Помилка ${res.status}: ${describeError(err)}`, false);
        }
      } catch (e) {
        if (e.status === 401) renderAddPage();
        else if (e.error) showResult(`Файл не прийнято: ${e.details ? e.details.map((d) => d.message).join('; ') : describeError(e)}`, false);
        else showResult(`Не вдалося: ${e.message}. Натисніть ще раз, дубля не буде.`, false);
      } finally {
        if (!degraded.isDegraded()) submitBtn.disabled = false;
      }
    });
  }

  // ---------- Сторінка матеріалу ----------
  // Файл віддається лише зареєстрованим, тому качаємо через запит із токеном, а не звичайним посиланням
  // Файл беремо запитом (з токеном, якщо є), а не звичайним посиланням.
  // mode: 'preview' — /files/{id}/preview (PDF, Word, TXT, доступно й гостю); 'download' — /files/{id} (лише зареєстровані)
  async function fetchFileBlob(file, mode) {
    const url = `${API_URL}${file.url}${mode === 'preview' ? '/preview' : ''}`;
    const res = await callApi(`GET ${file.url}${mode === 'preview' ? '/preview' : ''}`, url, { headers: authHeaders(), retry: { retries: 1, timeoutMs: 120000 } });
    if (res.status === 401) { location.href = loginUrl(); return null; }
    if (!res.ok) {
      const err = await readError(res);
      $('mFileNote').textContent = err.code === 'FILE_CONTENT_MISSING'
        ? 'Це тестовий матеріал: файлу на сервері немає.'
        : `Не вдалося отримати файл: ${err.details ? err.details.map((d) => d.message).join('; ') : describeError(err)}`;
      return null;
    }
    return res.blob();
  }

  async function withFileButtons(task) {
    $('mPreview').disabled = true;
    $('mDownload').disabled = true;
    $('mFileNote').textContent = '';
    try { await task(); } catch (e) { $('mFileNote').textContent = `Не вдалося показати файл: ${e.message}`; }
    finally { $('mPreview').disabled = false; $('mDownload').disabled = false; }
  }

  function downloadFile(file) {
    return withFileButtons(async () => {
      const blob = await fetchFileBlob(file, 'download');
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: file.fileName });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    });
  }

  // Перегляд прямо на сторінці.
  // PDF, Word (.docx), TXT — для всіх, через /preview. PDF показуємо без панелі браузера (без кнопок «скачати» / «друк»).
  // Відео, аудіо, картинки — лише зареєстрованим (вони однаково можуть їх скачати).
  const DOC_PREVIEW = ['pdf', 'docx', 'txt'];
  const MEDIA_PREVIEW = { mp4: 'video/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
  let previewUrl = null;

  function closePreview() {
    $('previewCard').hidden = true;
    $('previewBody').innerHTML = '';
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
  }

  function showPreview(file, node) {
    $('previewBody').appendChild(node);
    $('previewTitle').textContent = `Перегляд: ${file.fileName}`;
    $('previewCard').hidden = false;
    $('previewCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function previewFile(file) {
    const ext = file.fileName.includes('.') ? file.fileName.split('.').pop().toLowerCase() : '';
    const isDoc = DOC_PREVIEW.includes(ext);
    const media = MEDIA_PREVIEW[ext];
    const canDownload = Access.can(currentUser(), P.FILE_READ);
    if (!isDoc && !(media && canDownload)) {
      let note;
      if (canDownload) note = `Файли .${ext} на сайті не показуються. Натисніть «Скачати», щоб відкрити файл на пристрої.`;
      else if (media) note = 'Відео, аудіо й картинки можна переглянути після входу.';
      else if (ext === 'doc') note = 'Старий формат Word (.doc) на сайті не показується. Його можна скачати після входу.';
      else note = `Файли .${ext} на сайті не показуються. Їх можна скачати після входу.`;
      $('mFileNote').textContent = note;
      return Promise.resolve();
    }
    return withFileButtons(async () => {
      const raw = await fetchFileBlob(file, isDoc ? 'preview' : 'download');
      if (!raw) return;
      closePreview();
      if (ext === 'txt') {
        showPreview(file, Object.assign(document.createElement('pre'), { className: 'preview-text', textContent: await raw.text() }));
      } else if (ext === 'docx') {
        const box = document.createElement('div');
        box.className = 'preview-docx';
        await window.StudyDocx.render(await raw.arrayBuffer(), box);
        showPreview(file, box);
      } else if (ext === 'pdf') {
        previewUrl = URL.createObjectURL(new Blob([raw], { type: 'application/pdf' }));
        // #toolbar=0 ховає панель вбудованого переглядача (кнопки «скачати», «друк»)
        showPreview(file, Object.assign(document.createElement('iframe'), { src: `${previewUrl}#toolbar=0&navpanes=0`, title: file.fileName, className: 'preview-frame' }));
      } else {
        previewUrl = URL.createObjectURL(new Blob([raw], { type: media }));
        let el;
        if (ext === 'mp4') el = Object.assign(document.createElement('video'), { src: previewUrl, controls: true, className: 'preview-video' });
        else if (ext === 'mp3' || ext === 'wav') el = Object.assign(document.createElement('audio'), { src: previewUrl, controls: true, className: 'preview-audio' });
        else el = Object.assign(document.createElement('img'), { src: previewUrl, alt: file.fileName, className: 'preview-image' });
        showPreview(file, el);
      }
    });
  }

  // Гість: не даємо зберегти перегляд правою кнопкою (повністю заборонити збереження неможливо)
  document.addEventListener('contextmenu', (e) => {
    if (!Access.can(currentUser(), P.FILE_READ) && e.target.closest && e.target.closest('#previewBody')) e.preventDefault();
  });

  async function loadMaterialPage() {
    const id = new URLSearchParams(location.search).get('id');

    try {
      const res = await callApi(`GET /materials/${id}`, `${API_URL}/materials/${encodeURIComponent(id)}`, { headers: authHeaders() });
      if (res.status === 401) { location.replace(loginUrl()); return; }
      if (!res.ok) {
        const err = await readError(res);
        $('materialError').textContent = res.status === 404 ? 'Матеріал не знайдено або видалено.' : describeError(err);
        return;
      }
      const m = await res.json();
      document.title = `${m.title} · StudySwap`;
      $('mTitle').textContent = m.title;
      $('mType').textContent = m.type;
      $('mSubject').textContent = m.subject;
      $('mCourse').textContent = `${m.course} курс`;
      $('mUniversity').textContent = m.university;
      $('mAuthor').textContent = m.authorNickname;
      $('mDate').textContent = formatDate(m.createdAt);
      $('mDescription').textContent = m.description || 'Опису немає.';
      $('mFileName').textContent = `${m.file.fileName} · ${formatSize(m.file.sizeBytes)}`;
      // Переглянути може кожен; скачати — лише зареєстровані. Гість натискає «Скачати» → вхід і повернення сюди
      const canDownload = Access.can(currentUser(), P.FILE_READ);
      $('mGuestNote').hidden = canDownload;
      $('mPreview').onclick = () => previewFile(m.file);
      if (canDownload) {
        $('mDownload').textContent = 'Скачати';
        $('mDownload').onclick = () => downloadFile(m.file);
      } else {
        $('mDownload').textContent = '🔒 Скачати';
        $('mDownload').onclick = () => { location.href = loginUrl(); };
        $('mLogin').href = loginUrl();
        $('mRegister').href = loginUrl().replace('#login', '#register');
      }

      const canDelete = Access.canManageMaterial(currentUser(), m, 'delete');
      $('mDelete').hidden = !canDelete;
      $('mAccessNote').textContent = canDelete
        ? (currentUser().id === m.authorId ? 'Це ваш матеріал: ви можете його видалити.' : 'Ви адмін: можете видалити будь-який матеріал.')
        : '';
      $('mDelete').onclick = async () => { if (await deleteMaterial(m)) location.href = 'index.html'; };
      $('materialCard').hidden = false;
    } catch (e) {
      $('materialError').textContent = `Не вдалося завантажити: ${e.message} (requestId: ${e.requestId})`;
    }
  }

  // ---------- Профіль ----------
  const initials = (name) => name.trim().split(/[\s_.-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

  // Після зміни нікнейма оновлюємо збережену сесію, щоб шапка показала нове ім'я
  function updateSessionUser(user) {
    if (!session) return;
    const secondsLeft = Math.max(1, Math.round((session.expiresAt - Date.now()) / 1000));
    session = Session.save({ accessToken: session.token, expiresIn: secondsLeft, user: { ...session.user, ...user } });
    renderSession();
  }

  function renderProfileHead(me) {
    $('pAvatar').textContent = initials(me.nickname);
    $('pNickname').textContent = me.nickname;
    $('pRole').textContent = Access.roleLabel(me.role);
    $('pRole').className = `profile-role role-${me.role}`;
    $('pRole').hidden = me.role === 'user';
    $('pLogin').textContent = `@${me.login}`;
    $('pEmail').textContent = me.email;
    const f = $('profileForm');
    f.nickname.value = me.nickname;
    f.email.value = me.email;
    f.login.value = me.login;
  }

  const isAdmin = () => Access.isAdmin(currentUser());

  function profileRow(m) {
    const tr = document.createElement('tr');
    const title = cell('', 'title');
    title.appendChild(Object.assign(document.createElement('a'), { href: `material.html?id=${m.id}`, textContent: m.title }));
    const typeTd = cell('');
    typeTd.appendChild(Object.assign(document.createElement('span'), { className: 'chip', textContent: m.type }));
    const actions = cell('', 'actions');
    const user = currentUser();
    if (Access.canManageMaterial(user, m, 'update')) {
      const edit = Object.assign(document.createElement('button'), { className: 'btn btn-outline btn-xs', textContent: 'Редагувати' });
      edit.dataset.api = '';
      edit.addEventListener('click', () => openEdit(m));
      actions.appendChild(edit);
    }
    if (Access.canManageMaterial(user, m, 'delete')) {
      const del = Object.assign(document.createElement('button'), { className: 'btn btn-danger btn-xs', textContent: 'Видалити' });
      del.dataset.api = '';
      del.addEventListener('click', async () => { if (await deleteMaterial(m)) loadProfileMaterials(); });
      actions.appendChild(del);
    }
    const authorTd = cell(m.authorNickname || '—');
    authorTd.hidden = !isAdmin();
    tr.append(title, cell(m.subject), cell(String(m.course)), typeTd, authorTd, cell(formatDate(m.createdAt)), actions);
    return tr;
  }

  async function loadProfileMaterials() {
    $('pListError').textContent = '';
    // Адмін керує всіма матеріалами, користувач — своїми
    const url = isAdmin() ? `${API_URL}/materials` : `${API_URL}/users/me/materials`;
    try {
      const res = await callApi(isAdmin() ? 'GET /materials' : 'GET /users/me/materials', url, { headers: authHeaders() });
      if (res.status === 401) { location.replace(loginUrl()); return; }
      if (!res.ok) { $('pListError').textContent = describeError(await readError(res)); return; }
      const { items, total } = await res.json();
      $('pCount').textContent = String(total);
      const tbody = $('pList');
      tbody.innerHTML = '';
      if (!items.length) {
        const tr = document.createElement('tr');
        tr.className = 'empty';
        const td = cell('');
        td.colSpan = 7;
        td.append('Ви ще нічого не додали. ', Object.assign(document.createElement('a'), { href: 'add.html', textContent: 'Додати перший матеріал →' }));
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
      }
      items.forEach((m) => tbody.appendChild(profileRow(m)));
    } catch (e) {
      $('pListError').textContent = `Не вдалося завантажити: ${e.message}`;
    }
  }

  // Редагування матеріалу у вікні; надсилаємо лише змінені поля (PATCH)
  let editing = null;
  let editNewFile = null;
  function openEdit(m) {
    editing = m;
    editNewFile = null;
    const f = $('editForm');
    f.title.value = m.title;
    f.subject.value = m.subject;
    f.university.value = m.university;
    $('editFileInput').value = '';
    $('editFileName').textContent = `📄 ${m.file.fileName}`;
    $('editFileNote').textContent = 'Залиште як є або оберіть новий файл';
    $('editFileNote').className = 'field-note';
    f.course.value = String(m.course);
    f.type.value = m.type;
    f.description.value = m.description || '';
    $('editResult').textContent = '';
    $('editDialog').showModal();
  }

  async function saveEdit(event) {
    event.preventDefault();
    const f = $('editForm');
    const next = {
      title: f.title.value.trim(), subject: f.subject.value.trim(), university: f.university.value.trim(),
      course: Number(f.course.value), type: f.type.value, description: f.description.value.trim(),
    };
    const changes = Object.fromEntries(Object.entries(next).filter(([k, v]) => v !== (editing[k] ?? '')));
    if (!Object.keys(changes).length && !editNewFile) { $('editDialog').close(); return; }
    // Новий файл: спершу POST /files, потім його id іде в PATCH як fileId
    if (editNewFile) {
      try {
        $('editResult').className = 'result ok';
        $('editResult').textContent = 'Завантажуємо новий файл…';
        changes.fileId = (await uploadFile(editNewFile)).id;
      } catch (e) {
        $('editResult').className = 'result bad';
        $('editResult').textContent = e.details ? e.details.map((d) => d.message).join('; ') : `Файл не прийнято: ${e.message || describeError(e)}`;
        return;
      }
    }
    const res = await callApi(`PATCH /materials/${editing.id}`, `${API_URL}/materials/${editing.id}`, {
      method: 'PATCH', headers: authHeaders(), body: JSON.stringify(changes),
    });
    if (res.ok) { $('editDialog').close(); loadProfileMaterials(); return; }
    const err = await readError(res);
    $('editResult').className = 'result bad';
    $('editResult').textContent = res.status === 403 ? 'Недостатньо прав' : (err.details ? err.details.map((d) => d.message).join('; ') : describeError(err));
  }

  const ACCOUNT_MESSAGES = {
    NICKNAME_TAKEN: 'Такий нікнейм уже зайнятий',
    EMAIL_TAKEN: 'Акаунт із такою поштою вже існує',
    WRONG_PASSWORD: 'Поточний пароль неправильний',
  };
  const accountError = (e) => ACCOUNT_MESSAGES[e.code] || (e.details ? e.details.map((d) => d.message).join('; ') : describeError(e));
  const setResult = (id, text, ok) => { $(id).textContent = text; $(id).className = `result ${ok ? 'ok' : 'bad'}`; };


  // ---------- Суперадмін: призначення адмінів ----------
  function roleRow(u) {
    const tr = document.createElement('tr');
    const roleTd = cell('');
    roleTd.appendChild(Object.assign(document.createElement('span'), { className: `role-chip ${u.role}`, textContent: Access.roleLabel(u.role) }));
    const actions = cell('', 'actions');
    const me = currentUser();
    if (u.id !== me.id && u.role !== 'superadmin') {
      const toAdmin = u.role !== 'admin';
      const btn = Object.assign(document.createElement('button'), {
        className: `btn btn-xs ${toAdmin ? 'btn-outline' : 'btn-danger'}`,
        textContent: toAdmin ? 'Зробити адміном' : 'Зняти адміна',
      });
      btn.dataset.api = '';
      btn.addEventListener('click', () => changeRole(u, toAdmin ? 'admin' : 'user'));
      actions.appendChild(btn);
    }
    tr.append(cell(u.nickname), cell(`@${u.login}`), cell(u.email), roleTd, actions);
    return tr;
  }

  async function loadRoles() {
    const q = $('rolesSearch').value.trim();
    const res = await callApi('GET /users', `${API_URL}/users${q ? `?q=${encodeURIComponent(q)}` : ''}`, { headers: authHeaders() });
    if (!res.ok) { setResult('rolesResult', describeError(await readError(res)), false); return; }
    const { items } = await res.json();
    const tbody = $('rolesList');
    tbody.innerHTML = '';
    if (!items.length) {
      const tr = document.createElement('tr');
      tr.className = 'empty';
      const td = cell('Нікого не знайдено');
      td.colSpan = 5;
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
    items.forEach((u) => tbody.appendChild(roleRow(u)));
  }

  async function changeRole(u, role) {
    const question = role === 'admin' ? `Зробити ${u.nickname} адміном?` : `Зняти з ${u.nickname} роль адміна?`;
    if (!window.confirm(question)) return;
    const res = await callApi(`PATCH /users/${u.id}/role`, `${API_URL}/users/${u.id}/role`, {
      method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ role }),
    });
    if (res.ok) {
      setResult('rolesResult', role === 'admin' ? `${u.nickname} тепер адмін ✓` : `${u.nickname} більше не адмін ✓`, true);
      loadRoles();
    } else {
      const err = await readError(res);
      setResult('rolesResult', res.status === 403 ? 'Недостатньо прав' : describeError(err), false);
    }
  }

  let rolesTimer = null;
  function setupRoles() {
    $('rolesCard').hidden = false;
    $('rolesSearch').addEventListener('input', () => { clearTimeout(rolesTimer); rolesTimer = setTimeout(loadRoles, 300); });
    loadRoles();
  }

  async function loadProfilePage() {
    if (!currentUser()) { location.replace(loginUrl()); return; }
    try {
      const res = await callApi('GET /users/me', `${API_URL}/users/me`, { headers: authHeaders() });
      if (res.status === 401) { location.replace(loginUrl()); return; }
      if (!res.ok) throw await readError(res);
      const me = await res.json();
      renderProfileHead(me);
      updateSessionUser(me);
    } catch (e) {
      renderProfileHead({ ...currentUser(), login: currentUser().login || '', email: currentUser().email || '' });
    }
    $('pMaterialsTitle').textContent = isAdmin() ? 'Всі матеріали' : 'Мої матеріали';
    $('pAuthorCol').hidden = !isAdmin();
    $('adminNext').hidden = !isAdmin();
    if (Access.can(currentUser(), P.USER_ROLE_MANAGE)) setupRoles();
    loadProfileMaterials();

    $('profileForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const f = event.target;
      const me = currentUser();
      const changes = {};
      if (f.nickname.value.trim() !== me.nickname) changes.nickname = f.nickname.value.trim();
      if (f.email.value.trim() !== me.email) changes.email = f.email.value.trim();
      if (!Object.keys(changes).length) { setResult('profileResult', 'Нічого не змінено', true); return; }
      const res = await callApi('PATCH /users/me', `${API_URL}/users/me`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(changes) });
      if (res.ok) {
        const updated = await res.json();
        renderProfileHead(updated);
        updateSessionUser(updated);
        setResult('profileResult', 'Збережено ✓', true);
      } else {
        setResult('profileResult', accountError(await readError(res)), false);
      }
    });

    $('passwordForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const f = event.target;
      const body = { currentPassword: f.currentPassword.value, newPassword: f.newPassword.value };
      const res = await callApi('POST /users/me/password', `${API_URL}/users/me/password`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(body), retry: { retries: 0 },
      });
      if (res.status === 204) { f.reset(); setResult('passwordResult', 'Пароль змінено ✓', true); }
      else setResult('passwordResult', accountError(await readError(res)), false);
    });

    $('logoutBtn2').addEventListener('click', () => $('logoutBtn').click());
    $('editForm').addEventListener('submit', saveEdit);
    $('editFileInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const problem = checkFile(file);
      editNewFile = problem ? null : file;
      $('editFileName').textContent = problem ? `📄 ${editing.file.fileName}` : `📄 ${file.name} (новий)`;
      $('editFileNote').textContent = problem || `${formatSize(file.size)} · замінить поточний файл після «Зберегти»`;
      $('editFileNote').className = problem ? 'field-note bad-note' : 'field-note';
    });
    $('editCancel').addEventListener('click', () => $('editDialog').close());
  }

  // ---------- Старт ----------
  $('retryNowBtn').addEventListener('click', () => degraded.retryNow());
  renderSession();

  if (page === 'material') {
    loadMaterialPage();
    $('previewClose').addEventListener('click', closePreview);
  }
  if (page === 'profile') loadProfilePage();
  checkHealth().then((ok) => { if (ok && page === 'home') loadMaterials(); });
}());
