// lib.js — fonctions d'extraction et de mise en forme, sans interface.
// Exposées dans globalThis.BafExtract pour content.js.
(() => {
  'use strict';

  const PAGE_SIZE = 500;   // le serveur accepte 500 lignes par page
  const DELAY_MS = 300;    // pause entre deux pages pour ménager le serveur
  const MAX_PAGES = 400;   // garde-fou

  const SEARCH_RE = /\/api\/.+\/search-by-criteria\/?(?:\?|$)/i;

  // Libellés des recherches connues (chemin de l'API → nom de fichier / titre)
  const LABELS = [
    [/\/session\/v1\/search-by-criteria/, 'sessions', 'Sessions'],
    [/\/candidats\/v1\/nationaux\/search-by-criteria/, 'candidats_nationaux', 'Candidats (national)'],
    [/\/candidats\/v1\/parcours-hybrides\/search-by-criteria/, 'parcours_hybrides', 'Parcours hybrides'],
    [/\/candidats\/v1\/parcours-hors-application\/search-by-criteria/, 'parcours_hors_application', 'Parcours hors application'],
    [/\/candidats\/v1\/search-by-criteria/, 'candidats', 'Candidats'],
    [/\/membre-jury\/v1\/search-by-criteria/, 'membres_jury', 'Membres de jury'],
    [/\/utilisateurs\/v1\/search-by-criteria-organisme/, 'utilisateurs_organisme', 'Utilisateurs (organismes)'],
    [/\/utilisateurs\/v1\/search-by-criteria/, 'utilisateurs', 'Utilisateurs'],
    [/\/statistiques\/v1\/(\w+)\/search-by-criteria/, 'statistiques_$1', 'Statistiques ($1)'],
    [/\/referentiels-documentaires\/v1\/search-by-criteria/, 'referentiels_documentaires', 'Référentiels documentaires']
  ];

  function labelFor(path) {
    for (const [re, slug, title] of LABELS) {
      const m = path.match(re);
      if (m) return { slug: slug.replace('$1', m[1] || ''), title: title.replace('$1', m[1] || '') };
    }
    const seg = path.split('/api/')[1] || path;
    const slug = seg.replace(/\/search-by-criteria.*$/, '').replace(/\/v\d+/g, '').replace(/[^a-z0-9]+/gi, '_');
    return { slug, title: slug.replace(/_/g, ' ') };
  }

  function isSearchUrl(url) {
    try {
      const u = new URL(url, location.href);
      return u.origin === location.origin && SEARCH_RE.test(u.pathname);
    } catch {
      return false;
    }
  }

  function xsrfToken() {
    const m = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(t);
          reject(new DOMException('Annulé', 'AbortError'));
        }, { once: true });
      }
    });
  }

  async function fetchPage(url, criteria, pageNumber, signal) {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-XSRF-TOKEN': xsrfToken(),
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({ ...criteria, pageNumber, pageSize: PAGE_SIZE })
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error('Session expirée ou droits insuffisants : rechargez la page et reconnectez-vous.');
    }
    if (!res.ok) throw new Error(`Erreur du serveur (HTTP ${res.status}).`);
    const data = await res.json();
    if (!data || !Array.isArray(data.content)) throw new Error('Réponse inattendue du serveur.');
    return data;
  }

  // Rejoue la recherche page par page et renvoie toutes les lignes.
  // Le serveur ne sert pas plus de totalElementsDisplayed lignes (10 000) :
  // au-delà, il renvoie des doublons. On dédoublonne donc sur « id » et on
  // s'arrête au plafond.
  async function fetchAll(search, onProgress = () => {}, signal) {
    const rows = [];
    const seenIds = new Set();
    let page = 0;
    let totalPages = 1;
    let total = search.total ?? null;
    let displayed = search.displayed ?? null;
    for (;;) {
      const data = await fetchPage(search.url, search.criteria, page, signal);
      for (const r of data.content) {
        const id = r && r.id;
        if (id !== undefined && id !== null) {
          if (seenIds.has(id)) continue;
          seenIds.add(id);
        }
        rows.push(r);
      }
      totalPages = data.totalPages || totalPages;
      total = data.totalElements ?? total;
      displayed = data.totalElementsDisplayed ?? displayed;
      onProgress({ rows: rows.length, total, page: page + 1, totalPages });
      page++;
      const cap = displayed ?? Infinity;
      if (!data.hasNext || data.content.length === 0 || page >= totalPages || page >= MAX_PAGES || rows.length >= cap) break;
      await sleep(DELAY_MS, signal);
    }
    return { rows, total, displayed };
  }

  // Détail d'une session et liste de ses candidats (mêmes appels que les écrans de l'application)
  const API = '/baf-administration/api';
  async function lire(res) {
    if (res.status === 401 || res.status === 403) throw new Error('Session expirée ou droits insuffisants : rechargez la page et reconnectez-vous.');
    if (!res.ok) throw new Error(`Erreur du serveur (HTTP ${res.status}).`);
    return res.json();
  }
  async function getDetail(id, signal) {
    return lire(await fetch(`${API}/session/v1/${encodeURIComponent(id)}`, {
      credentials: 'include', signal,
      headers: { Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken(), 'X-Requested-With': 'XMLHttpRequest' }
    }));
  }
  async function getCandidats(id, signal) {
    const data = await lire(await fetch(`${API}/candidats/v1/liste-candidats-session`, {
      method: 'POST', credentials: 'include', signal,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': xsrfToken(), 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ sesId: id, pageNumber: 0, pageSize: 500, pageOrderDTOs: [{ sortField: 'nomFamille', sortOrder: 'ASC' }] })
    }));
    return Array.isArray(data?.content) ? data.content : [];
  }

  // Aplatit les objets imbriqués (a.b.c) ; les tableaux sont gardés en JSON.
  function flatten(obj, prefix = '', out = {}) {
    for (const [k, v] of Object.entries(obj || {})) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
      else out[key] = Array.isArray(v) ? JSON.stringify(v) : v;
    }
    return out;
  }

  // CSV pour Excel (FR) et Grist : séparateur « ; », UTF-8 avec BOM.
  function toCSV(rows) {
    const flat = rows.map((r) => flatten(r));
    const headers = [];
    const seen = new Set();
    for (const r of flat) for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); headers.push(k); }
    const cell = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.map(cell).join(';')];
    for (const r of flat) lines.push(headers.map((h) => cell(r[h])).join(';'));
    return { csv: '﻿' + lines.join('\r\n'), headers };
  }

  function timestamp(d = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}h${p(d.getMinutes())}`;
  }

  function download(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  globalThis.BafExtract = { labelFor, isSearchUrl, fetchAll, flatten, toCSV, timestamp, download, getDetail, getCandidats, sleep, PAGE_SIZE };
})();
