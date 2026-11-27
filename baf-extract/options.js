// options.js — enregistrement de la connexion à Grist.
const $ = (id) => document.getElementById(id);
const DEFAUTS = { gristUrl: 'https://drajes-test.getgrist.com', gristDoc: 'goAigiQY7UB8jt8yJfAao8' };

function message(txt, classe) { $('message').textContent = txt; $('message').className = classe || ''; }

chrome.storage.local.get(['gristUrl', 'gristDoc', 'gristKey']).then(c => {
  $('url').value = c.gristUrl || DEFAUTS.gristUrl;
  $('doc').value = c.gristDoc || DEFAUTS.gristDoc;
  $('cle').value = c.gristKey || '';
});

async function enregistrer() {
  const url = $('url').value.trim().replace(/\/+$/, '');
  if (!/^https:\/\/([a-z0-9-]+\.)*(getgrist\.com|grist\.numerique\.gouv\.fr)$/i.test(url)) {
    message("Adresse refusée : l'extension ne peut joindre que *.getgrist.com ou grist.numerique.gouv.fr.", 'erreur');
    return false;
  }
  await chrome.storage.local.set({ gristUrl: url, gristDoc: $('doc').value.trim(), gristKey: $('cle').value.trim() });
  message('Réglages enregistrés.', 'ok');
  return true;
}

$('enregistrer').addEventListener('click', enregistrer);
$('tester').addEventListener('click', async () => {
  if (!(await enregistrer())) return;
  message('Test en cours…');
  const r = await chrome.runtime.sendMessage({ type: 'grist-tester' });
  if (!r?.ok) return message(r?.erreur || 'Échec du test.', 'erreur');
  if (r.manquantes.length) return message(`Connexion réussie (${r.tables} tables), mais il manque : ${r.manquantes.join(', ')}.`, 'erreur');
  message(`Connexion réussie : les ${6} tables des sessions sont présentes dans le document.`, 'ok');
});
