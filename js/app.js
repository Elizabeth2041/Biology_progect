/* Дерево родства животных - логика сайта.
   Обычный JavaScript без библиотек: сайт открывается двойным щелчком по index.html.
   Данные лежат в data/tree-data.js (их создаёт tools/build_data.py). */
(function () {
  'use strict';

  var DATA = window.CLADE_DATA;
  if (!DATA) {
    document.querySelector('main').insertAdjacentHTML('afterbegin',
      '<p class="form-error">Не найден файл data/tree-data.js. Запустите: python3 tools/build_data.py</p>');
    return;
  }
  var N = DATA.nodes;
  var STUDIES = DATA.studies;
  var ROOT = N[0];
  var NOW = new Date().getFullYear();

  /* ------------------------------------------------------------ подготовка данных */
  N.forEach(function (n) { n.kids = []; });
  N.forEach(function (n) {
    n.par = n.parent == null ? null : N[n.parent];
    if (n.par) n.par.kids.push(n);
    n.isLeaf = n.kind === 'leaf';
    n.named = !n.isLeaf && n.naming !== 'none';
    n.year = null;
    if (!n.isLeaf && n.studies.length) {
      n.year = Math.max.apply(null, n.studies.map(function (s) { return STUDIES[s].year; }));
    }
  });
  (function walk(n, depth) {
    n.depth = depth;
    n.leaves = n.isLeaf ? [n] : [];
    n.kids.forEach(function (k) { walk(k, depth + 1); n.leaves = n.leaves.concat(k.leaves); });
  })(ROOT, 0);

  var CLADES = N.filter(function (n) { return !n.isLeaf; });
  var LEAVES = N.filter(function (n) { return n.isLeaf; });
  var YEARS = Object.keys(STUDIES).map(function (k) { return STUDIES[k].year; });
  var MIN_YEAR = Math.min.apply(null, YEARS);
  var MAX_YEAR = Math.max.apply(null, YEARS);

  /* ------------------------------------------------------------ мелкие помощники */
  function el(tag, attrs, kids) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] == null || attrs[k] === false) return;
      if (k === 'text') node.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else node.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (kid) {
      if (kid == null) return;
      node.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
    });
    return node;
  }
  var SVG_NS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs, kids) {
    var node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] == null) return;
      if (k === 'text') node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (kid) { if (kid) node.appendChild(kid); });
    return node;
  }
  function $(id) { return document.getElementById(id); }
  function plural(n, forms) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    return b === 1 ? forms[0] : forms[2];
  }
  var F_SPECIES = ['вид', 'вида', 'видов'];
  var F_CLADES = ['клада', 'клады', 'клад'];
  var F_PAPERS = ['научная работа', 'научные работы', 'научных работ'];

  function title(n) { return n.isLeaf || n.named ? n.ru : 'Ветвь без названия'; }
  function shortName(n) { return title(n).split(' (')[0]; }
  /** Ближайшая клада с названием: сам узел или его предок. */
  function namedClade(n) {
    while (n && (n.isLeaf || !n.named)) n = n.par;
    return n;
  }
  function pathToRoot(n) {
    var out = [];
    for (; n; n = n.par) out.push(n);
    return out;
  }
  function mrca(a, b) {
    while (a.depth > b.depth) a = a.par;
    while (b.depth > a.depth) b = b.par;
    while (a !== b) { a = a.par; b = b.par; }
    return a;
  }
  function quote(n) { return '«' + shortName(n) + '»'; }
  function lowerFirst(s) {
    // «Лев» -> «лев», но латинские названия и аббревиатуры не трогаем
    return /^[А-ЯЁ][а-яё]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  }

  /* ------------------------------------------------------------ шапка, цифры, подвал */
  $('stats').append(
    el('li', {}, [el('b', { text: String(LEAVES.length) }), ' ' + plural(LEAVES.length, F_SPECIES) + ' животных']),
    el('li', {}, [el('b', { text: String(CLADES.length) }), ' ' + plural(CLADES.length, F_CLADES)]),
    el('li', {}, [el('b', { text: String(YEARS.length) }), ' ' + plural(YEARS.length, F_PAPERS)])
  );
  function ruDate(iso) { var p = iso.split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }
  $('src-version').textContent = 'Использована версия дерева ' + DATA.meta.synth + ' от ' + ruDate(DATA.meta.synthDate) + '.';
  $('src-leaves').textContent = LEAVES.length + ' ' + plural(LEAVES.length, F_SPECIES);
  $('built').textContent = 'Данные собраны ' + ruDate(DATA.meta.built) + '.';

  /* ------------------------------------------------------------ поиск по названиям */
  var nameIndex = {};
  function addName(name, node) {
    var key = name.trim().toLowerCase();
    if (key && !nameIndex[key]) nameIndex[key] = node;
  }
  LEAVES.concat(CLADES.filter(function (n) { return n.named; })).forEach(function (n) {
    addName(n.ru, n);
    addName(shortName(n), n);
    addName(n.lat, n);
  });
  function findByName(text) { return nameIndex[(text || '').trim().toLowerCase()] || null; }

  var byRu = function (a, b) { return a.ru.localeCompare(b.ru, 'ru'); };
  LEAVES.slice().sort(byRu).forEach(function (n) {
    $('species-names').appendChild(el('option', { value: n.ru, label: n.lat }));
    $('all-names').appendChild(el('option', { value: n.ru, label: n.lat }));
  });
  CLADES.filter(function (n) { return n.named; }).sort(byRu).forEach(function (n) {
    $('all-names').appendChild(el('option', { value: n.ru, label: n.lat }));
  });

  /* ============================================================ ДЕРЕВО */
  var state = {
    expanded: {},      // id клады -> true
    selected: ROOT,
    focus: ROOT,       // ветвь, которая сейчас показана в панели (по умолчанию всё дерево)
    yearFrom: null,    // фильтр: год, начиная с которого клада считается «недавно подтверждённой»
    showUnnamed: true,
    onlyList: false
  };
  var treePane = $('tree-pane');
  var detailPane = $('detail-pane');

  function collapseToOverview() {
    state.expanded = {};
    state.expanded[ROOT.id] = true;
    // Разворачиваем самые крупные ветви, пока строк не станет около 26
    for (;;) {
      var rows = visibleRows();
      if (rows.length >= 26) break;
      var best = null;
      rows.forEach(function (n) {
        if (!n.isLeaf && !state.expanded[n.id] && (!best || n.leaves.length > best.leaves.length)) best = n;
      });
      if (!best) break;
      state.expanded[best.id] = true;
    }
  }
  /** Дочерние ветви с учётом переключателя «показывать ветвления без названия». */
  function shownKids(n) {
    if (state.showUnnamed) return n.kids;
    var out = [];
    n.kids.forEach(function (k) {
      if (!k.isLeaf && !k.named) out = out.concat(shownKids(k)); else out.push(k);
    });
    return out;
  }
  function visibleRows() {
    var out = [];
    (function walk(n) {
      out.push(n);
      if (!n.isLeaf && state.expanded[n.id]) shownKids(n).forEach(walk);
    })(ROOT);
    return out;
  }
  function matches(n) { return state.yearFrom != null && n.year != null && n.year >= state.yearFrom; }
  function matchesInside(n) {
    var count = 0;
    (function walk(x) { x.kids.forEach(function (k) { if (matches(k)) count++; walk(k); }); })(n);
    return count;
  }

  function thumb(n, cls) {
    if (!n.img) return el('span', { class: cls + ' noimg', 'aria-hidden': 'true' });
    return el('img', { class: cls, src: 'img/' + n.ott + '.jpg', alt: '', loading: 'lazy' });
  }

  function treeRow(n) {
    var filtering = state.yearFrom != null;
    var cls = 'node ' + (n.isLeaf ? 'leaf' : n.named ? 'clade' : 'clade unnamed');
    if (n === state.selected) cls += ' selected';
    if (filtering) cls += matches(n) ? ' match' : ' dim';
    var li = el('li', { class: cls, role: 'treeitem', 'data-id': n.id });
    var open = !n.isLeaf && !!state.expanded[n.id];
    if (!n.isLeaf) li.setAttribute('aria-expanded', String(open));

    var label = el('button', { class: 'label', type: 'button', 'data-act': 'select' });
    if (n.isLeaf) {
      label.append(thumb(n, 'thumb'), el('span', { class: 'name', text: n.ru }), el('i', { class: 'lat', text: n.lat }));
    } else {
      label.append(el('span', { class: 'name', text: title(n) }));
      if (n.named && n.lat !== n.ru.split(' (')[0]) label.append(el('i', { class: 'lat', text: n.lat }));
      if (n.rank) label.append(el('span', { class: 'rank', text: n.rank }));
      if (!open) label.append(el('span', { class: 'count', text: n.leaves.length + ' ' + plural(n.leaves.length, F_SPECIES) }));
      if (n.year) label.append(el('span', { class: 'year', text: String(n.year), title: 'Год самого свежего исследования, подтверждающего эту ветвь' }));
      if (filtering && !open) {
        var inside = matchesInside(n);
        if (inside) label.append(el('span', { class: 'inside', text: 'внутри ещё ' + inside }));
      }
    }
    var row = el('div', { class: 'row' }, [
      n.isLeaf ? el('span', { class: 'toggle spacer', 'aria-hidden': 'true' })
        : el('button', { class: 'toggle', type: 'button', 'data-act': 'toggle',
            'aria-label': (open ? 'Свернуть: ' : 'Развернуть: ') + title(n), text: open ? '▾' : '▸' }),
      label
    ]);
    li.appendChild(row);
    if (open) li.appendChild(el('ul', { role: 'group' }, shownKids(n).map(treeRow)));
    return li;
  }

  function renderTree() {
    var scroll = treePane.scrollTop;
    treePane.textContent = '';
    if (state.onlyList && state.yearFrom != null) {
      treePane.appendChild(renderMatchList());
    } else {
      if (state.focus !== ROOT) treePane.appendChild(focusBar());
      treePane.appendChild(el('ul', { class: 'tree', role: 'tree' }, [treeRow(state.focus)]));
    }
    treePane.scrollTop = scroll;
  }

  /** Строка «где мы находимся», когда показана не всё дерево, а одна ветвь. */
  function focusBar() {
    var path = pathToRoot(state.focus.par).filter(function (n) { return n.named; }).reverse();
    var crumbs = el('ol', { class: 'crumbs' });
    path.forEach(function (n) {
      crumbs.appendChild(el('li', {}, [el('button', { class: 'inline-link', type: 'button', text: shortName(n),
        title: 'Показать эту ветвь', onclick: function () { setFocus(n); } })]));
    });
    crumbs.appendChild(el('li', {}, [el('b', { text: shortName(state.focus) })]));
    return el('div', { class: 'focus-bar' }, [
      el('span', { class: 'hint-text', text: 'Показана одна ветвь. Она находится здесь:' }),
      crumbs,
      el('button', { class: 'btn small', type: 'button', text: '← Всё дерево', onclick: function () { setFocus(ROOT); } })
    ]);
  }
  function setFocus(n) {
    state.focus = n;
    state.expanded[n.id] = true;
    treePane.scrollTop = 0;
    treePane.scrollLeft = 0;
    select(n);
  }

  function renderMatchList() {
    var found = CLADES.filter(matches).sort(function (a, b) { return b.year - a.year || a.depth - b.depth; });
    if (!found.length) return el('p', { class: 'empty', text: 'За этот период подтверждённых клад в базе нет. Выберите более длинный период.' });
    return el('ul', { class: 'match-list' }, found.map(function (n) {
      var where = n.named ? '' : ' (внутри клады ' + quote(namedClade(n)) + ')';
      return el('li', { class: n === state.selected ? 'selected' : '', 'data-id': n.id }, [
        el('button', { class: 'label', type: 'button', 'data-act': 'select' }, [
          el('span', { class: 'year', text: String(n.year) }),
          el('span', { class: 'name', text: title(n) + where }),
          el('span', { class: 'count', text: n.leaves.length + ' ' + plural(n.leaves.length, F_SPECIES) })
        ])
      ]);
    }));
  }

  treePane.addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-act]');
    if (!btn) return;
    var n = N[+btn.closest('[data-id]').getAttribute('data-id')];
    if (btn.getAttribute('data-act') === 'toggle') {
      state.expanded[n.id] = !state.expanded[n.id];
      renderTree();
    } else {
      select(n);
    }
  });

  function select(n) {
    state.selected = n;
    renderTree();
    renderDetail();
  }
  /** Раскрыть дерево до узла, выделить его и прокрутить к нему. */
  function reveal(n) {
    if ($('only-list').checked) { $('only-list').checked = false; state.onlyList = false; }
    var target = n;
    if (!state.showUnnamed && !n.isLeaf && !n.named) { state.showUnnamed = true; $('show-unnamed').checked = true; $('simple-note').hidden = true; }
    for (var p = target.par; p; p = p.par) state.expanded[p.id] = true;
    // Если узел вне показанной ветви или слишком глубоко в ней - показываем подходящую ветвь поменьше
    if (pathToRoot(n).indexOf(state.focus) < 0) state.focus = ROOT;
    if (n.depth - state.focus.depth > 13) {
      var best = ROOT;
      pathToRoot(n.par).forEach(function (a) {
        if (a.named && n.depth - a.depth >= 6 && n.depth - a.depth <= 11 && a.depth > best.depth) best = a;
      });
      state.focus = best;
    }
    select(target);
    var row = treePane.querySelector('[data-id="' + n.id + '"] > .row');
    if (row) {
      var top = row.getBoundingClientRect().top - treePane.getBoundingClientRect().top + treePane.scrollTop;
      treePane.scrollTop = Math.max(0, top - treePane.clientHeight / 3);
      var left = row.getBoundingClientRect().left - treePane.getBoundingClientRect().left + treePane.scrollLeft;
      treePane.scrollLeft = left > treePane.clientWidth * 0.5 ? left - 60 : 0;
    }
  }
  function goTo(n) {
    reveal(n);
    $('tree').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------------------------------------------- карточка клады или вида */
  function studyItem(id) {
    var s = STUDIES[id];
    var ref = s.ref || 'Исследование ' + id;
    return el('li', {}, [
      el('b', { text: s.year + ' ' }),
      s.url ? el('a', { href: s.url, target: '_blank', rel: 'noopener', text: ref }) : ref
    ]);
  }
  function linkList(n) {
    var items = [];
    var ott = n.ott;
    if (ott) items.push(el('a', { class: 'ext', href: 'https://www.onezoom.org/life/@=' + ott + '?lang=ru', target: '_blank', rel: 'noopener', text: 'Посмотреть на OneZoom' }));
    var otol = n.isLeaf ? 'ottol@' + n.ott : DATA.meta.synth + '@' + n.synth;
    items.push(el('a', { class: 'ext', href: 'https://tree.opentreeoflife.org/opentree/argus/' + otol, target: '_blank', rel: 'noopener', text: 'Открыть в Open Tree of Life' }));
    return el('p', { class: 'links' }, items);
  }
  function nodeButton(n) {
    return el('button', { class: 'chip', type: 'button', text: shortName(n), onclick: function () { reveal(n); } });
  }

  function renderDetail() {
    var n = state.selected;
    detailPane.textContent = '';
    var kids = [];
    if (n.isLeaf) {
      kids.push(el('div', { class: 'leaf-head' }, [
        n.img ? el('img', { class: 'photo', src: 'img/' + n.ott + '.jpg', alt: '' }) : null,
        el('div', {}, [el('p', { class: 'kind', text: 'Вид' }), el('h3', { text: n.ru }), el('p', { class: 'latin', text: n.lat })])
      ]));
      if (n.img) kids.push(el('p', { class: 'credit', text: 'Фото: ' + n.img.rights + '. ' + n.img.licence + '. Получено через OneZoom.' }));
      var lineage = pathToRoot(n.par).filter(function (x) { return x.named; }).reverse();
      kids.push(el('h4', { text: 'К каким кладам относится' }),
        el('p', { class: 'hint-text', text: 'От самой широкой к самой узкой. Нажмите на кладу, чтобы прочитать о ней.' }),
        el('div', { class: 'chips wrap' }, lineage.map(nodeButton)));
      var sisters = [];
      n.par.kids.forEach(function (k) { if (k !== n) sisters = sisters.concat(k.leaves); });
      if (sisters.length) {
        kids.push(el('h4', { text: 'Ближайшие родственники в нашем дереве' }),
          el('div', { class: 'chips wrap' }, sisters.slice(0, 8).map(nodeButton)));
        if (sisters.length > 8) kids.push(el('p', { class: 'hint-text', text: 'и ещё ' + (sisters.length - 8) + ' ' + plural(sisters.length - 8, F_SPECIES) }));
      }
      kids.push(el('p', {}, [el('button', { class: 'btn small primary', type: 'button', text: 'Сравнить с другим животным',
        onclick: function () { $('pick-a').value = n.ru; $('pick-b').value = ''; $('pick-c').value = '';
          $('ancestor').scrollIntoView({ behavior: 'smooth' }); $('pick-b').focus({ preventScroll: true }); } })]));
      kids.push(linkList(n));
    } else {
      kids.push(el('p', { class: 'kind', text: 'Клада' + (n.rank ? ' · традиционный ранг: ' + n.rank : '') }), el('h3', { text: title(n) }));
      if (n.named) kids.push(el('p', { class: 'latin', text: n.lat }));
      if (n.desc) kids.push(el('p', { text: n.desc }));
      if (n.naming === 'within') {
        kids.push(el('p', { class: 'remark', text: 'В нашем дереве показана только часть этой клады. Поэтому точка ветвления на схеме - общий предок показанных видов; он принадлежал к этой кладе.' }));
      } else if (!n.named) {
        var up = namedClade(n);
        kids.push(el('p', { class: 'remark' }, ['У этой точки ветвления нет собственного названия: учёные дают имена не каждой ветви. Она находится внутри клады ', nodeButton(up), '.']));
      }
      if (n.note) kids.push(el('p', { class: 'debate' }, [el('b', { text: 'Учёные ещё спорят. ' }), n.note]));

      kids.push(el('h4', { text: 'Из каких ветвей состоит' }), el('div', { class: 'chips wrap' }, n.kids.map(nodeButton)));
      if (n !== state.focus) kids.push(el('p', {}, [el('button', { class: 'btn small', type: 'button', text: 'Показать только эту ветвь', onclick: function () { setFocus(n); } })]));
      kids.push(el('p', { class: 'hint-text', text: 'В нашем дереве к этой кладе относится ' + n.leaves.length + ' ' + plural(n.leaves.length, F_SPECIES) + '.' }));

      kids.push(el('h4', { text: 'Какие исследования её подтверждают' }));
      if (n.studies.length) {
        kids.push(el('p', { class: 'hint-text', text: 'Научные работы из базы Open Tree of Life, в дереве которых есть именно эта ветвь. Самая свежая - ' + n.year + ' года.' }),
          el('ul', { class: 'studies' }, n.studies.map(studyItem)));
      } else {
        kids.push(el('p', { class: 'hint-text', text: 'В базе Open Tree of Life нет исследования, которое проверяло бы именно эту ветвь; она внесена по общепринятой классификации. Это не значит, что клада сомнительна.' }));
      }
      if (n.indirect.length) {
        kids.push(el('details', { class: 'hint' }, [
          el('summary', { text: 'Косвенные подтверждения: ' + n.indirect.length }),
          el('p', { text: 'Деревья из этих работ согласуются с этой ветвью, но видов в них было слишком мало, чтобы проверить именно её.' }),
          el('ul', { class: 'studies' }, n.indirect.map(studyItem))
        ]));
      }
      kids.push(linkList(n));
    }
    kids.forEach(function (k) { detailPane.appendChild(k); });
  }

  /* ---------------------------------------------- фильтр по годам */
  var PERIODS = [null, 5, 10, 15, 20];
  function setYearFrom(year) {
    state.yearFrom = year;
    $('year-from').value = year == null ? '' : year;
    Array.prototype.forEach.call($('year-chips').children, function (chip) {
      var p = chip.getAttribute('data-period');
      var on = p === '' ? year == null : year === NOW - Number(p);
      chip.setAttribute('aria-pressed', String(on));
    });
    var status = $('filter-status');
    if (year == null) {
      status.textContent = 'Показаны все клады. Самая свежая работа в базе - ' + MAX_YEAR + ' года, самая ранняя - ' + MIN_YEAR + ' года.';
    } else {
      var count = CLADES.filter(matches).length;
      status.textContent = 'Начиная с ' + year + ' года подтверждено: ' + count + ' ' + plural(count, F_CLADES) + ' из ' + CLADES.length +
        (state.onlyList ? '. Ниже они показаны списком.' : '. В дереве они выделены цветом.');
    }
    renderTree();
  }
  PERIODS.forEach(function (p) {
    $('year-chips').appendChild(el('button', {
      class: 'chip', type: 'button', 'data-period': p == null ? '' : p, 'aria-pressed': 'false',
      text: p == null ? 'Все' : 'За ' + p + ' лет',
      onclick: function () { setYearFrom(p == null ? null : NOW - p); }
    }));
  });
  $('year-from').min = MIN_YEAR;
  $('year-from').max = MAX_YEAR;
  $('year-from').placeholder = String(MIN_YEAR) + '–' + String(MAX_YEAR);
  $('year-from').addEventListener('input', function () {
    var v = parseInt(this.value, 10);
    if (!this.value) setYearFrom(null);
    else if (v >= 1900 && v <= NOW) setYearFrom(v);
  });
  $('only-list').addEventListener('change', function () {
    state.onlyList = this.checked;
    setYearFrom(this.checked && state.yearFrom == null ? NOW - 10 : state.yearFrom);
  });
  $('show-unnamed').addEventListener('change', function () {
    state.showUnnamed = this.checked;
    $('simple-note').hidden = this.checked;
    renderTree();
  });
  $('expand-all').addEventListener('click', function () {
    CLADES.forEach(function (n) { state.expanded[n.id] = true; });
    renderTree();
  });
  $('collapse-all').addEventListener('click', function () { state.focus = ROOT; collapseToOverview(); treePane.scrollTop = 0; treePane.scrollLeft = 0; renderTree(); renderDetail(); });
  $('tree-search').addEventListener('change', function () {
    var n = findByName(this.value);
    if (n) { reveal(n); this.setCustomValidity(''); }
    else if (this.value) { this.setCustomValidity('Такого названия в дереве нет'); this.reportValidity(); }
  });
  $('tree-search').addEventListener('input', function () { this.setCustomValidity(''); });

  /* ============================================================ ОБЩИЙ ПРЕДОК */
  var DISCOVERIES = [
    { title: 'Киты - родня бегемотов',
      text: 'Киты и дельфины - ветвь парнокопытных, а их ближайшие родственники на суше - бегемоты. С акулой дельфина роднит только форма тела.',
      pick: ['Tursiops truncatus', 'Hippopotamus amphibius', 'Carcharodon carcharias'] },
    { title: 'Птицы - это рептилии',
      text: 'Крокодил в родстве с воробьём ближе, чем с ящерицей. Поэтому «пресмыкающиеся без птиц» - не клада.',
      pick: ['Crocodylus niloticus', 'Passer domesticus', 'Lacerta agilis'] },
    { title: '«Рыбы» - не клада',
      text: 'Латимерия ближе к человеку, чем к окуню: наземные позвоночные произошли от лопастепёрых рыб.',
      pick: ['Latimeria chalumnae', 'Homo sapiens', 'Perca fluviatilis'] },
    { title: 'Насекомые - ветвь ракообразных',
      text: 'По данным ДНК насекомые произошли от ракообразных. Дафния ближе к пчеле, чем к речному раку.',
      pick: ['Daphnia pulex', 'Apis mellifera', 'Astacus astacus'] },
    { title: 'Слон и ламантин',
      text: 'Слон ближе к морскому ламантину, чем к носорогу. Их кладу - афротерий - открыли только благодаря ДНК.',
      pick: ['Loxodonta africana', 'Trichechus manatus', 'Rhinoceros unicornis'] },
    { title: 'Сокол - не ястреб',
      text: 'Соколы похожи на орлов и ястребов, но по ДНК они ближе к попугаям и воробьиным. Сходство - результат похожего образа жизни.',
      pick: ['Falco peregrinus', 'Psittacus erithacus', 'Aquila chrysaetos'] }
  ];
  var inputs = [$('pick-a'), $('pick-b'), $('pick-c')];
  DISCOVERIES.forEach(function (d) {
    var picked = d.pick.map(findByName);
    if (picked.some(function (x) { return !x; })) return; // вид убрали из списка - карточку не показываем
    $('discoveries').appendChild(el('article', { class: 'card' }, [
      el('h4', { text: d.title }), el('p', { text: d.text }),
      el('button', { class: 'btn small', type: 'button', text: 'Проверить',
        onclick: function () {
          inputs.forEach(function (inp, i) { inp.value = picked[i] ? picked[i].ru : ''; });
          showAncestor(picked);
          $('ancestor').scrollIntoView({ behavior: 'smooth' });
        } })
    ]));
  });

  $('picker').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var err = $('pick-error');
    err.textContent = '';
    var chosen = [];
    for (var i = 0; i < inputs.length; i++) {
      var text = inputs[i].value.trim();
      if (!text) {
        if (i < 2) { err.textContent = 'Выберите двух животных из списка.'; inputs[i].focus(); return; }
        continue;
      }
      var n = findByName(text);
      if (!n || !n.isLeaf) {
        err.textContent = '«' + text + '» нет в нашем дереве. Начните вводить название и выберите вариант из подсказки.';
        inputs[i].focus();
        return;
      }
      if (chosen.indexOf(n) >= 0) { err.textContent = 'Выберите разных животных.'; inputs[i].focus(); return; }
      chosen.push(n);
    }
    showAncestor(chosen);
  });
  $('pick-random').addEventListener('click', function () {
    var a = LEAVES[Math.floor(Math.random() * LEAVES.length)], b;
    do { b = LEAVES[Math.floor(Math.random() * LEAVES.length)]; } while (b === a);
    inputs[0].value = a.ru; inputs[1].value = b.ru; inputs[2].value = '';
    $('pick-error').textContent = '';
    showAncestor([a, b]);
  });

  /** Названные клады на пути от узла вверх до (не включая) stop. */
  function cladesBetween(from, stop) {
    var out = [];
    for (var n = from.par; n && n !== stop; n = n.par) if (n.named) out.push(n);
    return out;
  }
  function cladeLink(n, full) {
    return el('button', { class: 'inline-link', type: 'button', text: full ? title(n) : shortName(n), title: 'Показать в дереве', onclick: function () { goTo(n); } });
  }
  function describePoint(node, kids) {
    // «…в кладе X» либо «…в ветви без названия внутри клады X»
    var named = namedClade(node);
    kids.push(node.named ? 'Самая маленькая клада с названием, в которую они входят, - ' : 'У точки, где их ветви расходятся, нет собственного названия. Самая маленькая клада с названием, в которую они входят, - ');
    kids.push(el('strong', {}, [cladeLink(named, true)]));
    if (named.lat && named.lat !== shortName(named)) kids.push(', по-латыни ', el('i', { text: named.lat }));
    kids.push('.');
  }

  function showAncestor(sel) {
    var box = $('ancestor-result');
    box.textContent = '';
    var top = sel.reduce(mrca);
    var plan;   // структура для схемы
    var kids = [];
    var names = sel.map(function (n) { return n.ru; });

    if (sel.length === 2) {
      kids.push(el('h3', { text: names[0] + ' и ' + lowerFirst(names[1]) }));
      var p = [];
      describePoint(top, p);
      kids.push(el('p', { class: 'answer' }, p));
      plan = { node: top, kids: [{ leaf: sel[0] }, { leaf: sel[1] }] };
    } else {
      var pairs = [[0, 1], [0, 2], [1, 2]].map(function (ix) {
        return { a: sel[ix[0]], b: sel[ix[1]], m: mrca(sel[ix[0]], sel[ix[1]]), other: sel[3 - ix[0] - ix[1]] };
      }).sort(function (x, y) { return y.m.depth - x.m.depth; });
      var close = pairs[0];
      kids.push(el('h3', { text: names.join(', ').replace(/, ([^,]*)$/, ' и $1') }));
      if (close.m === top) {
        kids.push(el('p', { class: 'answer', text: 'В нашем дереве эти три ветви расходятся из одной точки: порядок их разделения здесь не показан.' }));
        plan = { node: top, kids: sel.map(function (n) { return { leaf: n }; }) };
      } else {
        var p1 = [el('strong', { text: close.a.ru + ' и ' + lowerFirst(close.b.ru) }), ' - самые близкие родственники в этой тройке. '];
        describePoint(close.m, p1);
        kids.push(el('p', { class: 'answer' }, p1));
        var p2 = [el('strong', { text: close.other.ru }), ' - более дальний родственник для обоих: эта ветвь отделилась раньше. Самая маленькая клада с названием, в которую входят все три животных, - ',
          el('strong', {}, [cladeLink(namedClade(top), true)]), '.'];
        kids.push(el('p', {}, p2));
        plan = { node: top, kids: [{ node: close.m, kids: [{ leaf: close.a }, { leaf: close.b }] }, { leaf: close.other }] };
      }
    }

    var shared = pathToRoot(top).filter(function (n) { return n.named; }).reverse();
    kids.push(el('p', {}, ['Чем меньше общая клада, тем позже жил последний общий предок и тем ближе родство. ',
      'Всего у этих животных ' + shared.length + ' ' + plural(shared.length, ['общая клада', 'общие клады', 'общих клад']) + ' с названием - от самой широкой к самой узкой:']));
    var crumbs = el('ol', { class: 'crumbs' });
    shared.forEach(function (n) { crumbs.appendChild(el('li', {}, [cladeLink(n)])); });
    kids.push(crumbs);

    kids.push(el('div', { class: 'diagram-scroll' }, [drawDiagram(plan, sel.length)]));
    kids.push(el('p', { class: 'hint-text', text: 'Как читать схему: время идёт снизу вверх. Внизу - древние общие предки, вверху - современные животные. Цветной кружок - точка, где ветви разошлись. Подписи на ветвях - клады; нажмите на любую, чтобы открыть её в дереве.' }));
    if (top.note) kids.push(el('p', { class: 'debate' }, [el('b', { text: 'Учёные ещё спорят. ' }), top.note]));
    kids.forEach(function (k) { box.appendChild(k); });
  }

  /* ---------------------------------------------- схема родства (SVG) */
  function drawDiagram(plan, leafCount) {
    // расстояние между видами: на узком экране поменьше
    var room = Math.floor(($('ancestor-result').clientWidth - 60) / leafCount);
    var COL = Math.max(200, Math.min(leafCount === 2 ? 300 : 260, room));
    var W = COL * leafCount + 40;
    var ROW = 34, CURVE = 46, LEAF_H = 112, PAD = 16;
    var column = 0;

    // 1) расставляем по горизонтали и считаем высоту каждой ветви
    (function place(item, parentNode) {
      var here = item.leaf || item.node;
      item.pills = parentNode ? cladesBetween(here, parentNode) : [];
      if (item.leaf) { item.x = 20 + COL * column + COL / 2; column++; item.top = LEAF_H; return; }
      item.kids.forEach(function (k) { place(k, item.node); });
      item.x = item.kids.reduce(function (s, k) { return s + k.x; }, 0) / item.kids.length;
      item.top = Math.max.apply(null, item.kids.map(function (k) { return k.top + k.pills.length * ROW + CURVE + PAD; }));
    })(plan, null);

    // 2) общий ствол: несколько ближайших клад и корень
    var trunk = pathToRoot(plan.node).slice(1).filter(function (n) { return n.named; });
    var shownTrunk = trunk.length > 5 ? trunk.slice(0, 3) : trunk.slice(0, Math.max(0, trunk.length - 1));
    var hiddenCount = trunk.length - shownTrunk.length - (trunk.length ? 1 : 0);
    var trunkRows = shownTrunk.length + (hiddenCount > 0 ? 1 : 0) + (trunk.length ? 1 : 0);
    var H = plan.top + 30 + trunkRows * ROW + 14;

    var root = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, class: 'kin', role: 'img',
      'aria-label': 'Схема родства выбранных животных' });
    var gLines = svg('g', { class: 'kin-lines' }), gTop = svg('g', {});
    root.append(gLines, gTop);

    function pill(n, x, y, muted) {
      var text = shortName(n);
      var w = Math.max(48, text.length * 8.1 + 26);
      var g = svg('g', { class: 'pill' + (muted ? ' muted' : ''), tabindex: '0', role: 'button', 'aria-label': 'Клада ' + text + ': показать в дереве' });
      g.append(svg('rect', { x: x - w / 2, y: y - 12, width: w, height: 24, rx: 12 }),
        svg('text', { x: x, y: y + 4.5, 'text-anchor': 'middle', text: text }));
      g.addEventListener('click', function () { goTo(n); });
      g.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); goTo(n); } });
      gTop.appendChild(g);
    }
    function wrapName(text) {
      // название вида в одну-две строки
      if (text.length <= 24) return [text];
      var cut = text.lastIndexOf(' ', 24);
      if (cut < 8) cut = text.indexOf(' ');
      return cut < 0 ? [text] : [text.slice(0, cut), text.slice(cut + 1)];
    }

    (function draw(item, parent) {
      if (parent) {
        var bottom = parent.top - CURVE;   // здесь вертикальная часть ветви переходит в дугу
        gLines.appendChild(svg('path', { d: 'M' + item.x + ' ' + item.top + ' V' + bottom +
          ' C' + item.x + ' ' + (bottom + CURVE * 0.7) + ' ' + parent.x + ' ' + (parent.top - CURVE * 0.5) + ' ' + parent.x + ' ' + parent.top }));
        var span = bottom - item.top;
        item.pills.forEach(function (n, i) { pill(n, item.x, item.top + span * (i + 1) / (item.pills.length + 1), false); });
      }
      if (item.leaf) {
        var n = item.leaf, cx = item.x;
        var clipId = 'clip' + n.id;
        gTop.appendChild(svg('clipPath', { id: clipId }, [svg('circle', { cx: cx, cy: 34, r: 30 })]));
        gTop.appendChild(svg('circle', { class: 'leaf-ring', cx: cx, cy: 34, r: 31 }));
        if (n.img) gTop.appendChild(svg('image', { href: 'img/' + n.ott + '.jpg', x: cx - 30, y: 4, width: 60, height: 60, 'clip-path': 'url(#' + clipId + ')', preserveAspectRatio: 'xMidYMid slice' }));
        var lines = wrapName(n.ru);
        lines.forEach(function (line, i) {
          gTop.appendChild(svg('text', { class: 'leaf-name', x: cx, y: 82 + i * 16, 'text-anchor': 'middle', text: line }));
        });
        if (lines.length === 1) gTop.appendChild(svg('text', { class: 'leaf-lat', x: cx, y: 98, 'text-anchor': 'middle', text: n.lat }));
        return;
      }
      item.kids.forEach(function (k) { draw(k, item); });
      // точка ветвления
      var isTop = !parent;
      gTop.appendChild(svg('circle', { class: 'split' + (isTop ? ' main' : ''), cx: item.x, cy: item.top, r: isTop ? 10 : 8 }));
      var named = namedClade(item.node);
      var label = item.node.named ? shortName(item.node) : 'ветвь без названия';
      var sub = item.node.named ? 'здесь ветви разошлись' : 'внутри клады ' + quote(named);
      var tx = item.x + 18;
      var anchor = 'start';
      if (tx + Math.max(label.length, sub.length) * 7.6 > W - 6) { tx = item.x - 18; anchor = 'end'; }
      var g = svg('g', { class: 'split-label', tabindex: '0', role: 'button', 'aria-label': label + ': показать в дереве' }, [
        svg('text', { class: 'split-name', x: tx, y: item.top - 2, 'text-anchor': anchor, text: label }),
        svg('text', { class: 'split-sub', x: tx, y: item.top + 14, 'text-anchor': anchor, text: sub })
      ]);
      g.addEventListener('click', function () { goTo(item.node); });
      g.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); goTo(item.node); } });
      gTop.appendChild(g);
    })(plan, null);

    // общий ствол вниз от главной точки ветвления
    var rows = shownTrunk.map(function (n) { return { clade: n }; });
    if (hiddenCount > 0) rows.push({ more: hiddenCount });
    if (trunk.length) rows.push({ clade: trunk[trunk.length - 1] });
    if (rows.length) {
      var y0 = plan.top + 30 + ROW / 2;
      gLines.appendChild(svg('path', { class: 'trunk', d: 'M' + plan.x + ' ' + plan.top + ' V' + (y0 + (rows.length - 1) * ROW) }));
      rows.forEach(function (r, i) {
        var y = y0 + i * ROW;
        if (r.clade) pill(r.clade, plan.x, y, true);
        else gTop.appendChild(svg('text', { class: 'trunk-more', x: plan.x + 14, y: y + 4, text: '… ещё ' + r.more + ' ' + plural(r.more, F_CLADES) }));
      });
    }
    return root;
  }

  /* ------------------------------------------------------------ запуск */
  collapseToOverview();
  setYearFrom(null);
  renderDetail();
})();
