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
    ui.options = el('button', { type: 'button', class: 'baf-x__link', onclick: ouvrirOptions }, 'Réglages de la connexion à Grist');
    ui.body = el('div', { class: 'baf-x__body', hidden: '' },
      el('p', { class: 'baf-x__title' }, 'Recherches repérées'), ui.hint, ui.list, ui.status, ui.cancel, ui.options);
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
      if (s.slug === 'sessions') {
        const coche = el('input', { type: 'checkbox' });
        coche.checked = !!s.avecDetail;
        coche.addEventListener('change', () => { s.avecDetail = coche.checked; });
        info.append(el('label', { class: 'baf-x__opt' }, coche, ' Grist : envoyer aussi le détail (lieu, équipe, grille, observations, stagiaires) – environ 2 requêtes par session'));
        actions.append(el('button', { type: 'button', class: 'baf-x__btn baf-x__btn--grist', title: 'Ajouter ou mettre à jour ces sessions dans Grist', onclick: () => runGrist(s, !!s.avecDetail) }, 'Grist'));
      }
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

  // ---- Envoi vers Grist -------------------------------------------------
  const G = globalThis.BafGrist;

  async function message(m) {
    try { return await chrome.runtime.sendMessage(m); }
    catch { return { ok: false, erreur: "L'extension a été mise à jour : rechargez la page." }; }
  }
  function ouvrirOptions() { message({ type: 'ouvrir-options' }); }

  async function envoyer(table, keys, records) {
    if (!records.length) return;
    const r = await message({ type: 'grist-envoyer', table, keys, records });
    if (!r?.ok) throw new Error(r?.erreur || "Échec de l'envoi vers Grist.");
  }

  async function runGrist(search, avecDetail) {
    if (busy) return;
    const etat = await message({ type: 'grist-etat' });
    if (!etat?.ok) {
      ui.status.className = 'baf-x__status baf-x__status--error';
      ui.status.replaceChildren(`${etat?.erreur || 'Grist non configuré.'} `, el('button', { type: 'button', class: 'baf-x__link', onclick: ouvrirOptions }, 'Ouvrir les réglages'));
      return;
    }
    busy = new AbortController();
    setButtonsDisabled(true);
    ui.status.className = 'baf-x__status';
    ui.status.textContent = 'Lecture des sessions…';
    const cumul = { details: 0, equipes: 0, grilles: 0, observations: 0, candidats: 0 };
    try {
      const { rows, total } = await X.fetchAll(search, (p) => {
        ui.status.textContent = `Lecture des sessions : page ${p.page}/${p.totalPages} — ${fmt(p.rows)} / ${fmt(p.total)}`;
      }, busy.signal);
      ui.status.textContent = `Envoi de ${fmt(rows.length)} sessions vers Grist…`;
      await envoyer('Sessions_BAFA_BAFD', ['Id_BAFA'], rows.map(G.session));

      if (avecDetail) {
        const vide = () => ({ details: [], equipes: [], grilles: [], observations: [], candidats: [] });
        let lot = vide();
        for (let i = 0; i < rows.length; i++) {
          const id = rows[i].id;
          const d = await X.getDetail(id, busy.signal);
          const c = await X.getCandidats(id, busy.signal);
          const t = G.detail(id, d, c);
          for (const k of Object.keys(lot)) lot[k].push(...t[k]);
          ui.status.textContent = `Détail des sessions : ${fmt(i + 1)} / ${fmt(rows.length)}`;
          if (lot.details.length >= 25 || i === rows.length - 1) {
            for (const [k, table] of Object.entries(G.TABLE_DE)) { await envoyer(table, G.CLES[table], lot[k]); cumul[k] += lot[k].length; }
            lot = vide();
          }
          await X.sleep(200, busy.signal);
        }
      }

      ui.status.className = 'baf-x__status baf-x__status--ok';
      ui.status.textContent = `${fmt(rows.length)} sessions ajoutées ou mises à jour dans Grist` + (avecDetail
        ? `, avec leur détail : ${fmt(cumul.equipes)} membres d'équipe, ${fmt(cumul.grilles)} journées, ${fmt(cumul.observations)} observations, ${fmt(cumul.candidats)} stagiaires.`
        : '. Cochez « envoyer aussi le détail » pour mettre à jour les tables de détail.');
      if (total !== null && rows.length < total) {
        ui.status.className = 'baf-x__status baf-x__status--warn';
        ui.status.textContent += ` Attention : ${fmt(total - rows.length)} sessions non récupérées (plafond du serveur) ; affinez la recherche.`;
      }
    } catch (err) {
      ui.status.className = 'baf-x__status baf-x__status--error';
      const deja = cumul.details ? ` ${fmt(cumul.details)} sessions détaillées avaient déjà été envoyées.` : '';
      ui.status.textContent = (err.name === 'AbortError' ? 'Envoi interrompu.' : `Échec : ${err.message}`) + deja;
    } finally {
      busy = null;
      setButtonsDisabled(false);
    }
  }

  if (document.body) { buildPanel(); render(); }
  else document.addEventListener('DOMContentLoaded', () => { buildPanel(); render(); }, { once: true });
})();
