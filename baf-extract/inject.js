// inject.js — exécuté dans le contexte de la page (world: MAIN), dès document_start.
// Observe les recherches lancées par l'application (POST .../search-by-criteria)
// et transmet au script de l'extension l'URL appelée, les critères envoyés
// et le nombre de résultats annoncé. Aucune donnée n'est envoyée ailleurs.
(() => {
  'use strict';
  if (window.__bafExtractHooked) return;
  window.__bafExtractHooked = true;

  const SEARCH_RE = /\/api\/.+\/search-by-criteria\/?(?:\?|$)/i;

  function report(url, body, response) {
    let criteria;
    let data;
    try {
      criteria = typeof body === 'string' ? JSON.parse(body) : null;
      data = typeof response === 'string' ? JSON.parse(response) : response;
    } catch {
      return;
    }
    if (!criteria || typeof criteria !== 'object') return;
    if (!data || !Array.isArray(data.content)) return;
    window.postMessage(
      {
        source: 'baf-extract',
        type: 'search',
        url: new URL(url, location.href).href,
        criteria,
        total: data.totalElements ?? null,
        displayed: data.totalElementsDisplayed ?? null
      },
      location.origin
    );
  }

  // XMLHttpRequest (utilisé par le HttpClient d'Angular)
  const xhrOpen = XMLHttpRequest.prototype.open;
  const xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__baf = { method: String(method).toUpperCase(), url: String(url) };
    return xhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    const info = this.__baf;
    if (info && info.method === 'POST' && SEARCH_RE.test(info.url)) {
      this.addEventListener('load', () => {
        if (this.status !== 200) return;
        const rt = this.responseType;
        if (rt === '' || rt === 'text') report(info.url, body, this.responseText);
        else if (rt === 'json') report(info.url, body, this.response);
      });
    }
    return xhrSend.apply(this, arguments);
  };

  // fetch (au cas où l'application l'utiliserait pour certaines recherches)
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const p = origFetch.apply(this, arguments);
    try {
      const url = typeof input === 'string' ? input : input && input.url;
      const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      const body = init && init.body;
      if (method === 'POST' && url && SEARCH_RE.test(url) && typeof body === 'string') {
        p.then((res) => {
          if (res.ok) res.clone().text().then((t) => report(url, body, t)).catch(() => {});
        }).catch(() => {});
      }
    } catch {
      /* ne jamais perturber l'application */
    }
    return p;
  };
})();
