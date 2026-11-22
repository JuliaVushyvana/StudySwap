// Перегляд Word (.docx) прямо на сторінці, без скачування й без інтернету.
// .docx — це ZIP-архів з XML; розпаковуємо його JSZip (vendor/jszip.min.js) і будуємо HTML:
// абзаци, заголовки, жирний / курсив / підкреслений текст, списки, таблиці, картинки, посилання.
// Старий формат .doc (не ZIP) так не прочитати — для нього лишається скачування.
// Використання: await StudyDocx.render(arrayBuffer, containerElement)

(function (global) {
  'use strict';

  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';

  const kids = (el, ns, name) => Array.from(el.childNodes).filter((n) => n.namespaceURI === ns && n.localName === name);
  const kid = (el, ns, name) => kids(el, ns, name)[0] || null;
  const wAttr = (el, name) => (el ? el.getAttributeNS(W, name) || el.getAttribute(`w:${name}`) : null);
  // <w:b/> або <w:b w:val="true"/> — увімкнено; w:val="0"/"false" — вимкнено
  const isOn = (el) => Boolean(el) && !['0', 'false', 'off'].includes(wAttr(el, 'val'));

  const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml' };

  async function render(arrayBuffer, container) {
    const zip = await global.JSZip.loadAsync(arrayBuffer);
    const docFile = zip.file('word/document.xml');
    if (!docFile) throw new Error('Це не документ Word (.docx)');
    const parse = (xml) => new DOMParser().parseFromString(xml, 'application/xml');
    const doc = parse(await docFile.async('string'));

    // Зв'язки: id картинки / посилання → файл у архіві або URL
    const rels = {};
    const relsFile = zip.file('word/_rels/document.xml.rels');
    if (relsFile) {
      parse(await relsFile.async('string')).querySelectorAll('Relationship').forEach((r) => {
        rels[r.getAttribute('Id')] = { target: r.getAttribute('Target'), external: r.getAttribute('TargetMode') === 'External' };
      });
    }
    const images = {};
    async function imageUrl(relId) {
      const rel = rels[relId];
      if (!rel) return null;
      if (images[relId]) return images[relId];
      const path = `word/${rel.target.replace(/^\/?word\//, '').replace(/^\.\//, '')}`;
      const file = zip.file(path);
      if (!file) return null;
      const ext = path.split('.').pop().toLowerCase();
      const blob = new Blob([await file.async('arraybuffer')], { type: IMAGE_TYPES[ext] || 'application/octet-stream' });
      images[relId] = URL.createObjectURL(blob);
      return images[relId];
    }

    async function renderRun(r) {
      const frag = document.createDocumentFragment();
      const rPr = kid(r, W, 'rPr');
      for (const n of Array.from(r.childNodes)) {
        if (n.namespaceURI === W && n.localName === 't') frag.append(n.textContent);
        else if (n.namespaceURI === W && n.localName === 'tab') frag.append('\t');
        else if (n.namespaceURI === W && (n.localName === 'br' || n.localName === 'cr')) frag.append(document.createElement('br'));
        else if (n.namespaceURI === W && n.localName === 'drawing') {
          const blip = n.getElementsByTagNameNS(A, 'blip')[0];
          const id = blip && (blip.getAttributeNS(R, 'embed') || blip.getAttribute('r:embed'));
          const url = id && await imageUrl(id);
          if (url) frag.append(Object.assign(document.createElement('img'), { src: url, alt: '', className: 'docx-img' }));
        }
      }
      if (!rPr) return frag;
      let node = frag;
      const wrap = (tag) => { const el = document.createElement(tag); el.append(node); node = el; };
      if (isOn(kid(rPr, W, 'b'))) wrap('strong');
      if (isOn(kid(rPr, W, 'i'))) wrap('em');
      const u = kid(rPr, W, 'u');
      if (u && wAttr(u, 'val') !== 'none') wrap('u');
      if (isOn(kid(rPr, W, 'strike'))) wrap('s');
      return node;
    }

    async function renderInline(parent, target) {
      for (const n of Array.from(parent.childNodes)) {
        if (n.namespaceURI !== W) continue;
        if (n.localName === 'r') target.append(await renderRun(n));
        else if (n.localName === 'hyperlink') {
          const id = n.getAttributeNS(R, 'id') || n.getAttribute('r:id');
          const rel = id && rels[id];
          const a = document.createElement('a');
          if (rel && rel.external && /^https?:/i.test(rel.target)) { a.href = rel.target; a.target = '_blank'; a.rel = 'noopener'; }
          await renderInline(n, a);
          target.append(a);
        } else if (['ins', 'smartTag', 'sdt', 'sdtContent', 'fldSimple'].includes(n.localName)) {
          await renderInline(n, target);
        }
      }
    }

    // Тип абзацу: заголовок, елемент списку чи звичайний текст
    function paragraphKind(p) {
      const pPr = kid(p, W, 'pPr');
      const style = (wAttr(pPr && kid(pPr, W, 'pStyle'), 'val') || '').toLowerCase();
      if (style === 'title') return { tag: 'h1' };
      const h = style.match(/^heading(\d)$/) || style.match(/^заголовок(\d)$/);
      if (h) return { tag: `h${Math.min(Number(h[1]) + 1, 6)}` };
      const numPr = pPr && kid(pPr, W, 'numPr');
      if (numPr || style.includes('list')) {
        const level = Number(wAttr(numPr && kid(numPr, W, 'ilvl'), 'val') || 0);
        return { tag: 'li', level };
      }
      const jc = wAttr(pPr && kid(pPr, W, 'jc'), 'val');
      return { tag: 'p', align: jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'right' : null };
    }

    async function renderBlocks(parent, target) {
      let list = null;
      for (const n of Array.from(parent.childNodes)) {
        if (n.namespaceURI !== W) continue;
        if (n.localName === 'p') {
          const kind = paragraphKind(n);
          const el = document.createElement(kind.tag);
          await renderInline(n, el);
          if (kind.tag === 'li') {
            if (!list) { list = document.createElement('ul'); target.append(list); }
            if (kind.level) el.style.marginLeft = `${kind.level * 24}px`;
            list.append(el);
            continue;
          }
          list = null;
          if (!el.textContent.trim() && !el.querySelector('img')) el.innerHTML = '&nbsp;';
          if (kind.align) el.style.textAlign = kind.align;
          target.append(el);
        } else if (n.localName === 'tbl') {
          list = null;
          const table = document.createElement('table');
          table.className = 'docx-table';
          for (const tr of kids(n, W, 'tr')) {
            const row = document.createElement('tr');
            for (const tc of kids(tr, W, 'tc')) {
              const cell = document.createElement('td');
              const span = Number(wAttr(kid(kid(tc, W, 'tcPr') || tc, W, 'gridSpan'), 'val') || 1);
              if (span > 1) cell.colSpan = span;
              await renderBlocks(tc, cell);
              row.append(cell);
            }
            table.append(row);
          }
          target.append(table);
        } else if (n.localName === 'sdt') {
          const content = kid(n, W, 'sdtContent');
          if (content) await renderBlocks(content, target);
        }
      }
    }

    const body = doc.getElementsByTagNameNS(W, 'body')[0];
    const page = document.createElement('div');
    page.className = 'docx-page';
    await renderBlocks(body, page);
    container.innerHTML = '';
    container.append(page);
  }

  global.StudyDocx = { render };
}(window));
