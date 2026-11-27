// content.js — reçoit les recherches repérées par inject.js et affiche
// un petit panneau d'export en bas à droite de l'application.
(() => {
  'use strict';
  const X = globalThis.BafExtract;
  const searches = new Map(); // clé : chemin de l'API ; valeur : dernière recherche
  let busy = null;            // AbortController de l'export en cours
  let panel;
  let ui = {};

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    const d = e.data;
    if (!d || d.source !== 'baf-extract' || d.type !== 'search') return;
    if (!X.isSearchUrl(d.url) || !d.criteria || typeof d.criteria !== 'object') return;
    const path = new URL(d.url).pathname;
    const { slug, title } = X.labelFor(path);
    searches.delete(path); // la plus récente passe en tête
    searches.set(path, { url: d.url, criteria: d.criteria, total: d.total, displayed: d.displayed, slug, title, at: new Date() });
    render();
  });

  function el(tag, attrs = {}, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of children) n.append(c);
    return n;
  }

  const fmt = (n) => (n === null || n === undefined ? '?' : Number(n).toLocaleString('fr-FR'));

  function buildPanel() {
    ui.badge = el('span', { class: 'baf-x__badge' }, '0');
    ui.toggle = el('button', { type: 'button', class: 'baf-x__toggle', 'aria-expanded': 'false', onclick: togglePanel },
      '⇩ Extraction', ui.badge);
    ui.list = el('ul', { class: 'baf-x__list' });
    ui.hint = el('p', { class: 'baf-x__hint' }, 'Lancez ou relancez une recherche dans l’application : elle apparaîtra ici, avec les filtres appliqués.');
    ui.status = el('p', { class: 'baf-x__status', role: 'status', 'aria-live': 'polite' });
    ui.cancel = el('button', { type: 'button', class: 'baf-x__btn baf-x__btn--secondary', hidden: '', onclick: () => busy && busy.abort() }, 'Annuler');
    ui.body = el('div', { class: 'baf-x__body', hidden: '' },
      el('p', { class: 'baf-x__title' }, 'Recherches repérées'), ui.hint, ui.list, ui.status, ui.cancel);
    panel = el('div', { id: 'baf-extract-panel', class: 'baf-x' }, ui.body, ui.toggle);
    document.body.append(panel);
  }

  function togglePanel() {
    const open = ui.body.hidden;
    ui.body.hidden = !open;
    ui.toggle.setAttribute('aria-expanded', String(open));
  }

  function render() {
    if (!panel) return;
    ui.badge.textContent = String(searches.size);
    ui.hint.hidden = searches.size > 0;
    ui.list.replaceChildren();
    for (const s of [...searches.values()].reverse()) {
      const capped = s.displayed !== null && s.total !== null && s.displayed < s.total;
      const info = el('div', { class: 'baf-x__info' },
        el('strong', {}, s.title),
        el('span', {}, ` — ${fmt(s.total)} résultat${s.total > 1 ? 's' : ''}`),
        el('small', {}, `Recherche de ${s.at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`));
      if (capped) info.append(el('small', { class: 'baf-x__warn' }, `Le serveur ne renvoie que ${fmt(s.displayed)} lignes : affinez la recherche (par période, par exemple) et exportez en plusieurs fois.`));
      const filters = Object.fromEntries(Object.entries(s.criteria).filter(([k]) => !['pageNumber', 'pageSize', 'pageOrderDTOs'].includes(k)));
      const crit = el('details', { class: 'baf-x__crit' },
        el('summary', {}, Object.keys(filters).length ? `Filtres (${Object.keys(filters).length})` : 'Aucun filtre'),
        el('pre', {}, JSON.stringify(filters, null, 2)));
      info.append(crit);
      const actions = el('div', { class: 'baf-x__actions' },
        el('button', { type: 'button', class: 'baf-x__btn', onclick: () => runExport(s, 'csv') }, 'CSV'),
        el('button', { type: 'button', class: 'baf-x__btn baf-x__btn--secondary', onclick: () => runExport(s, 'json') }, 'JSON'));
      ui.list.append(el('li', { class: 'baf-x__item' }, info, actions));
    }
    setButtonsDisabled(!!busy);
  }

  function setButtonsDisabled(disabled) {
    ui.list.querySelectorAll('button').forEach((b) => { b.disabled = disabled; });
    ui.cancel.hidden = !disabled;
  }

  async function runExport(search, format) {
    if (busy) return;
    busy = new AbortController();
    setButtonsDisabled(true);
    ui.status.className = 'baf-x__status';
    ui.status.textContent = 'Démarrage…';
    try {
      const { rows, total } = await X.fetchAll(search, (p) => {
        ui.status.textContent = `Page ${p.page}/${p.totalPages} — ${fmt(p.rows)} / ${fmt(p.total)} lignes`;
      }, busy.signal);
      const name = `bafa-bafd_${search.slug}_${X.timestamp()}`;
      if (format === 'csv') {
        const { csv, headers } = X.toCSV(rows);
        X.download(csv, `${name}.csv`, 'text/csv;charset=utf-8');
        ui.status.textContent = `${fmt(rows.length)} lignes × ${headers.length} colonnes exportées.`;
      } else {
        X.download(JSON.stringify(rows, null, 2), `${name}.json`, 'application/json');
        ui.status.textContent = `${fmt(rows.length)} lignes exportées.`;
      }
      if (total !== null && rows.length < total) {
        ui.status.className = 'baf-x__status baf-x__status--warn';
        ui.status.textContent += ` Attention : ${fmt(total)} résultats annoncés, ${fmt(total - rows.length)} non récupérés (plafond du serveur). Affinez la recherche (par période, par exemple) et exportez en plusieurs fois.`;
      }
    } catch (err) {
      ui.status.className = 'baf-x__status baf-x__status--error';
      ui.status.textContent = err.name === 'AbortError' ? 'Export annulé.' : `Échec : ${err.message}`;
    } finally {
      busy = null;
      setButtonsDisabled(false);
    }
  }

  if (document.body) { buildPanel(); render(); }
  else document.addEventListener('DOMContentLoaded', () => { buildPanel(); render(); }, { once: true });
})();
