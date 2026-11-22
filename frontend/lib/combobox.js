// Поле зі списком і пошуком (combobox): показує всі варіанти, фільтрує під час введення,
// а якщо такого варіанта немає — пропонує «+ Новий …: «текст»».
// Використання: StudyCombobox.attach(inputElement, { options: [...], newLabel: 'Новий предмет' })
// strict: true — лише вибір зі списку (без введення й без «+ Новий»), порядок варіантів зберігається.
// otherLabel — пункт «Інше» в кінці списку: очищає поле, щоб вписати свій варіант (підказка otherPlaceholder).

(function (global) {
  'use strict';

  const norm = (s) => s.trim().toLocaleLowerCase('uk');

  function attach(input, { options = [], newLabel = 'Додати', strict = false, onSelect = null, otherLabel = null, otherPlaceholder = null } = {}) {
    let items = [];
    let active = -1;
    let values = [];

    const wrap = document.createElement('div');
    wrap.className = strict ? 'combo combo-strict' : 'combo';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const list = document.createElement('ul');
    list.className = 'combo-list';
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    wrap.appendChild(list);
    const listId = `combo-${Math.random().toString(36).slice(2, 8)}`;
    list.id = listId;

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', listId);
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('autocomplete', 'off');
    input.removeAttribute('list');

    const setOptions = (next) => {
      const seen = new Set();
      values = next.map((v) => String(v).trim()).filter((v) => v && !seen.has(norm(v)) && seen.add(norm(v)));
      if (!strict) values.sort((a, b) => a.localeCompare(b, 'uk')); // у strict порядок як задано (1..6 курс)
    };
    setOptions(options);

    // Назва з підсвіченим збігом
    function labelNode(text, query) {
      const span = document.createElement('span');
      const i = query ? norm(text).indexOf(norm(query)) : -1;
      if (i < 0) { span.textContent = text; return span; }
      span.append(text.slice(0, i), Object.assign(document.createElement('mark'), { textContent: text.slice(i, i + query.trim().length) }), text.slice(i + query.trim().length));
      return span;
    }

    function render() {
      const query = strict ? '' : input.value; // у strict показуємо всі варіанти
      const q = norm(query);
      const matches = values.filter((v) => !q || norm(v).includes(q));
      const exact = values.some((v) => norm(v) === q);
      items = matches.map((v) => ({ value: v, isNew: false }));
      if (q && !exact) items.push({ value: query.trim(), isNew: true });
      if (otherLabel && !strict && !q) items.push({ value: '', isOther: true });

      list.innerHTML = '';
      items.forEach((item, i) => {
        const li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.className = `combo-option${item.isNew ? ' combo-new' : ''}${item.isOther ? ' combo-other' : ''}${i === active ? ' active' : ''}`;
        if (item.isOther) {
          li.textContent = `✎ ${otherLabel}`;
        } else if (item.isNew) {
          li.append(`+ ${newLabel}: «`, Object.assign(document.createElement('b'), { textContent: item.value }), '»');
        } else {
          li.appendChild(labelNode(item.value, query));
          if (norm(item.value) === norm(input.value)) li.classList.add('selected');
        }
        // mousedown, а не click: інакше поле втратить фокус раніше, ніж спрацює вибір
        li.addEventListener('mousedown', (e) => { e.preventDefault(); choose(i); });
        list.appendChild(li);
      });
      if (!items.length) list.appendChild(Object.assign(document.createElement('li'), { className: 'combo-empty', textContent: 'Почніть вводити назву' }));
      open(true);
    }

    function open(on) {
      list.hidden = !on;
      wrap.classList.toggle('open', on);
      input.setAttribute('aria-expanded', String(on));
      if (!on) active = -1;
    }

    function choose(i) {
      const item = items[i];
      if (!item) return;
      if (item.isOther) {
        // «Інше»: порожнє поле з підказкою, список закривається — далі людина просто пише свій варіант
        input.value = '';
        if (otherPlaceholder) input.placeholder = otherPlaceholder;
        open(false);
        input.focus();
        return;
      }
      input.value = item.value;
      if (item.isNew) setOptions([...values, item.value]); // новий варіант одразу з'являється у списку
      open(false);
      if (onSelect) onSelect(item.value);
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function move(step) {
      if (list.hidden) { render(); return; }
      if (!items.length) return;
      active = (active + step + items.length) % items.length;
      render();
      list.children[active]?.scrollIntoView({ block: 'nearest' });
    }

    if (strict) input.readOnly = true;
    input.addEventListener('focus', () => { active = strict ? values.findIndex((v) => norm(v) === norm(input.value)) : -1; render(); });
    input.addEventListener('click', () => { if (list.hidden) render(); });
    input.addEventListener('input', () => { active = -1; render(); });
    input.addEventListener('blur', () => open(false));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter' && !list.hidden && active >= 0) { e.preventDefault(); choose(active); }
      else if (e.key === 'Escape') open(false);
    });

    return { setOptions: (next) => setOptions([...values, ...next]) };
  }

  global.StudyCombobox = { attach };
}(window));
