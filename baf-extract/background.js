// background.js — seul composant qui s'adresse à Grist.
// Il lit la configuration (URL, document, clé d'API) dans chrome.storage.local
// et envoie les lignes par l'API REST de Grist, en « ajout ou mise à jour »
// (PUT /records) : une ligne existante est retrouvée par ses clés et mise à jour.

const TABLES_ATTENDUES = [
  'Sessions_BAFA_BAFD', 'Sessions_Details', 'Sessions_Equipes',
  'Sessions_Grilles', 'Sessions_Observations', 'Sessions_Candidats'
];
const LOT = 200;

async function config() {
  const c = await chrome.storage.local.get(['gristUrl', 'gristDoc', 'gristKey']);
  const url = (c.gristUrl || '').trim().replace(/\/+$/, '');
  const doc = (c.gristDoc || '').trim();
  const key = (c.gristKey || '').trim();
  if (!url || !doc || !key) throw new Error("Grist n'est pas configuré : ouvrez les options de l'extension.");
  if (!/^https:\/\//.test(url)) throw new Error("L'adresse Grist doit commencer par https://");
  return { base: `${url}/api/docs/${encodeURIComponent(doc)}`, key };
}

async function appel(method, url, key, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const txt = (await res.text()).slice(0, 300);
    if (res.status === 401 || res.status === 403) throw new Error(`Accès refusé par Grist (HTTP ${res.status}) : vérifiez la clé d'API et vos droits sur le document.`);
    if (res.status === 404) throw new Error(`Document ou table introuvable (HTTP 404) : ${txt}`);
    throw new Error(`Erreur Grist (HTTP ${res.status}) : ${txt}`);
  }
  return res.status === 204 ? null : res.json().catch(() => null);
}

async function tester() {
  const { base, key } = await config();
  const r = await appel('GET', `${base}/tables`, key);
  const ids = (r?.tables || []).map(t => t.id);
  const manquantes = TABLES_ATTENDUES.filter(t => !ids.includes(t));
  return { tables: ids.length, manquantes };
}

async function ajouterOuMettreAJour({ table, keys, records }) {
  if (!TABLES_ATTENDUES.includes(table)) throw new Error(`Table non autorisée : ${table}`);
  const { base, key } = await config();
  const url = `${base}/tables/${encodeURIComponent(table)}/records`;
  for (let i = 0; i < records.length; i += LOT) {
    const lot = records.slice(i, i + LOT).map(r => ({
      require: Object.fromEntries(keys.map(k => [k, r[k]])),
      fields: Object.fromEntries(Object.entries(r).filter(([k]) => !keys.includes(k)))
    }));
    await appel('PUT', url, key, { records: lot });
  }
  return { envoyees: records.length };
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const repondre = (p) => { p.then(r => reply({ ok: true, ...r }), e => reply({ ok: false, erreur: e.message })); return true; };
  if (msg?.type === 'grist-etat') return repondre(config().then(() => ({})));
  if (msg?.type === 'grist-tester') return repondre(tester());
  if (msg?.type === 'grist-envoyer') return repondre(ajouterOuMettreAJour(msg));
  if (msg?.type === 'ouvrir-options') { chrome.runtime.openOptionsPage(); reply({ ok: true }); }
  return false;
});
