import { analyserUrlDocument, ClientGrist, COLONNES_RESULTAT } from "../lib/grist.js";
import { creerRecherche, problemesConfig, CONFIG_PAR_DEFAUT } from "../lib/portail.js";
import { preparerLignes, verifierLignes, valeursDistinctes, STATUTS } from "../lib/controle.js";

const $ = (id) => document.getElementById(id);
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const TEXTE_CONFIG_DEFAUT = JSON.stringify(CONFIG_PAR_DEFAUT, null, 2);

let client = null;
let colonnes = [];
let enregistrementsCache = [];
let arretDemande = false;

const CLASSES_STATUT = {
  [STATUTS.CARTE]: "statut-valide",
  [STATUTS.STAGIAIRE]: "statut-stagiaire",
  [STATUTS.EXPIREE]: "statut-expiree",
  [STATUTS.A_VERIFIER]: "statut-verifier",
  [STATUTS.NON_TROUVE]: "statut-nontrouve",
  [STATUTS.ERREUR]: "statut-erreur",
};

// ---------- utilitaires d'affichage ----------
function etat(id, texte, type = "") {
  const el = $(id);
  el.textContent = texte;
  el.className = "etat" + (type ? " " + type : "");
}

function remplirSelect(select, options, valeur, avecVide) {
  select.replaceChildren();
  if (avecVide) select.append(new Option("— aucune —", ""));
  for (const o of options) select.append(new Option(o.texte, o.valeur));
  if (valeur !== undefined && [...select.options].some((o) => o.value === valeur)) select.value = valeur;
}

function deviner(regex, valeurSauvee) {
  if (valeurSauvee && colonnes.some((c) => c.id === valeurSauvee)) return valeurSauvee;
  const c = colonnes.find((col) => regex.test(col.id) || regex.test(col.label));
  return c ? c.id : undefined;
}

async function sauver(partiel) {
  await chrome.storage.local.set(partiel);
}

// ---------- 1. connexion à Grist ----------
async function connecter() {
  etat("etatConnexion", "Connexion…");
  try {
    const { base, docId } = analyserUrlDocument($("urlDoc").value);
    const cle = $("cleApi").value.trim();
    if (!cle) throw new Error("Clé API manquante.");
    client = new ClientGrist({ base, docId, cle });
    await client.resoudreDocument();
    const tables = await client.tables();
    await sauver({ urlDoc: $("urlDoc").value.trim(), cleApi: cle });
    const { table } = await chrome.storage.local.get("table");
    remplirSelect($("table"), tables.map((t) => ({ texte: t, valeur: t })), table);
    etat("etatConnexion", `Connecté – ${tables.length} table(s)`, "ok");
    for (const id of ["secTable", "secPortail", "secLancement"]) $(id).hidden = false;
    await choisirTable();
  } catch (e) {
    client = null;
    etat("etatConnexion", e.message, "erreur");
  }
}

// ---------- 2. table et colonnes ----------
async function choisirTable() {
  const table = $("table").value;
  await sauver({ table });
  colonnes = await client.colonnes(table);
  const reglages = await chrome.storage.local.get(["colNom", "colNomUsage", "colPrenom", "colFiltre", "valeurFiltre"]);
  const opts = colonnes
    .filter((c) => !c.id.startsWith("CartePro_"))
    .map((c) => ({ texte: c.label === c.id ? c.id : `${c.label} (${c.id})`, valeur: c.id }));
  remplirSelect($("colNom"), opts, deviner(/nom.*(naiss|famille)|^nom$/i, reglages.colNom));
  remplirSelect($("colNomUsage"), opts, deviner(/usage|marital/i, reglages.colNomUsage), true);
  remplirSelect($("colPrenom"), opts, deviner(/pr[ée]nom/i, reglages.colPrenom));
  remplirSelect($("colFiltre"), opts, deviner(/session|num[ée]ro.*formation/i, reglages.colFiltre), true);
  $("valeurFiltre").value = reglages.valeurFiltre || "";
  afficherColonnesResultat();
  enregistrementsCache = await client.enregistrements(table);
  majValeursFiltre();
}

/** Propose les valeurs de la colonne de filtre (n° de session) et affiche l'effectif concerné. */
function majValeursFiltre() {
  const col = $("colFiltre").value;
  const liste = $("listeValeurs");
  liste.replaceChildren();
  if (col) {
    for (const v of valeursDistinctes(enregistrementsCache, col)) liste.append(new Option(v, v));
  }
  majEffectif();
}

function majEffectif() {
  const lignes = preparerLignes(enregistrementsCache, {
    colNom: $("colNom").value,
    colPrenom: $("colPrenom").value,
    colFiltre: $("colFiltre").value || null,
    valeurFiltre: $("valeurFiltre").value,
    ignorerDepuisJours: 0,
  });
  $("effectif").textContent = `${lignes.length} stagiaire(s) concerné(s) sur ${enregistrementsCache.length} ligne(s) de la table.`;
}

function colonnesManquantes() {
  return COLONNES_RESULTAT.filter((c) => !colonnes.some((col) => col.id === c.id));
}

function afficherColonnesResultat() {
  const zone = $("colonnesResultat");
  zone.replaceChildren();
  const manquantes = colonnesManquantes();
  if (!manquantes.length) {
    zone.textContent = "Les colonnes de résultat (CartePro_…) sont présentes dans cette table.";
    return;
  }
  const p = document.createElement("p");
  p.style.margin = "0";
  p.textContent = `Colonnes de résultat absentes de la table (${manquantes.length}) :`;
  const ul = document.createElement("ul");
  for (const c of manquantes) {
    const li = document.createElement("li");
    li.textContent = `${c.label} (${c.id})`;
    ul.append(li);
  }
  const bouton = document.createElement("button");
  bouton.className = "secondaire";
  bouton.style.marginTop = ".6rem";
  bouton.textContent = "Créer ces colonnes dans la table";
  bouton.addEventListener("click", async () => {
    bouton.disabled = true;
    try {
      await client.ajouterColonnes($("table").value, manquantes);
      colonnes = await client.colonnes($("table").value);
      afficherColonnesResultat();
    } catch (e) {
      bouton.disabled = false;
      bouton.textContent = "Échec : " + e.message;
    }
  });
  zone.append(p, ul, bouton);
}

// ---------- 3. réglage du portail ----------
function lireConfigPortail() {
  const texte = $("configPortail").value.trim();
  if (!texte) throw new Error("Le réglage du portail n'est pas encore renseigné.");
  let cfg;
  try {
    cfg = JSON.parse(texte);
  } catch (e) {
    throw new Error("Réglage du portail : JSON invalide (" + e.message + ").");
  }
  const probs = problemesConfig(cfg);
  if (probs.length) throw new Error(probs.join(" "));
  return cfg;
}

async function enregistrerPortail() {
  try {
    lireConfigPortail();
    await sauver({ configPortail: $("configPortail").value.trim() });
    etat("etatPortail", "Réglage enregistré.", "ok");
  } catch (e) {
    etat("etatPortail", e.message, "erreur");
  }
}

async function tester() {
  const sortie = $("resultatTest");
  sortie.textContent = "Recherche…";
  try {
    const rechercher = creerRecherche(lireConfigPortail());
    const res = await rechercher($("testNom").value.trim(), $("testPrenom").value.trim());
    const lisible = res.map((r) => ({
      ...r,
      expiration: r.expiration ? r.expiration.toLocaleDateString("fr-FR") : null,
    }));
    sortie.textContent = res.length
      ? JSON.stringify(lisible, null, 2)
      : "Aucun résultat.";
  } catch (e) {
    sortie.textContent = "Erreur : " + e.message;
  }
}

// ---------- 4. vérification ----------
function ajouterLigneJournal(ligne, resultat, champs) {
  const tr = document.createElement("tr");
  const cellules = [ligne.nomNaissance || "", ligne.prenom || "", null, champs.CartePro_Numero || "", champs.CartePro_Detail || ""];
  cellules.forEach((valeur, i) => {
    const td = document.createElement("td");
    if (i === 2) {
      const span = document.createElement("span");
      span.className = "statut " + (CLASSES_STATUT[resultat.statut] || "");
      span.textContent = resultat.statut;
      td.append(span);
    } else if (i === 3 && champs.CartePro_Lien) {
      const a = document.createElement("a");
      a.href = champs.CartePro_Lien;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = valeur;
      td.append(a);
    } else {
      td.textContent = valeur;
    }
    tr.append(td);
  });
  $("journal").querySelector("tbody").append(tr);
}

function afficherBilan(bilan, simulation) {
  const zone = $("bilan");
  zone.hidden = false;
  zone.replaceChildren();
  const titre = document.createElement("strong");
  titre.textContent =
    `${bilan.traites} stagiaire(s) vérifié(s) sur ${bilan.total}` +
    (bilan.arrete ? " – arrêt demandé" : "") +
    (simulation ? " – simulation, rien n'a été écrit dans Grist" : " – résultats écrits dans Grist");
  const ul = document.createElement("ul");
  for (const [statut, n] of Object.entries(bilan.parStatut)) {
    const li = document.createElement("li");
    li.textContent = `${statut} : ${n}`;
    ul.append(li);
  }
  zone.append(titre, ul);
  if (bilan.nonTrouves.length) {
    const p = document.createElement("p");
    p.style.margin = ".6rem 0 0";
    p.textContent =
      "Non trouvés sur le portail : " +
      bilan.nonTrouves.map((l) => `${l.nomNaissance} ${l.prenom}`).join(", ");
    zone.append(p);
  }
}

async function lancer() {
  arretDemande = false;
  $("btnLancer").disabled = true;
  $("btnArreter").disabled = false;
  $("bilan").hidden = true;
  const tbody = $("journal").querySelector("tbody");
  tbody.replaceChildren();
  try {
    const table = $("table").value;
    const colNom = $("colNom").value;
    const colPrenom = $("colPrenom").value;
    if (!colNom || !colPrenom) throw new Error("Choisissez les colonnes du nom et du prénom.");
    const simulation = $("simulation").checked;
    if (!simulation && colonnesManquantes().length) {
      throw new Error("Créez d'abord les colonnes de résultat (rubrique 2), ou cochez « Simulation ».");
    }
    const rechercher = creerRecherche(lireConfigPortail());
    const delaiMs = Math.max(1000, Number($("delai").value || 1.5) * 1000);
    const options = {
      colNom,
      colNomUsage: $("colNomUsage").value || null,
      colPrenom,
      colFiltre: $("colFiltre").value || null,
      valeurFiltre: $("valeurFiltre").value,
      ignorerDepuisJours: $("ignorerRecents").checked ? 30 : 0,
    };
    await sauver({ ...options, delai: $("delai").value });

    etat("etatLancement", "Lecture de la table…");
    const enregistrements = await client.enregistrements(table);
    const lignes = preparerLignes(enregistrements, options);
    if (!lignes.length) {
      etat("etatLancement", "Aucun stagiaire à vérifier avec ces critères.", "erreur");
      return;
    }
    const prog = $("progression");
    prog.hidden = false;
    prog.max = lignes.length;
    prog.value = 0;
    $("journal").hidden = false;

    const bilan = await verifierLignes({
      lignes,
      rechercher,
      attendre,
      delaiMs,
      ecrire: simulation ? null : (lot) => client.mettreAJour(table, lot),
      doitArreter: () => arretDemande,
      surResultat: (ligne, resultat, champs, rang) => {
        ajouterLigneJournal(ligne, resultat, champs);
        prog.value = rang + 1;
        etat("etatLancement", `${rang + 1} / ${lignes.length}`);
      },
    });
    afficherBilan(bilan, simulation);
    etat("etatLancement", bilan.arrete ? "Arrêté." : "Terminé.", "ok");
  } catch (e) {
    etat("etatLancement", e.message, "erreur");
  } finally {
    $("btnLancer").disabled = false;
    $("btnArreter").disabled = true;
  }
}

// ---------- initialisation ----------
async function initialiser() {
  const s = await chrome.storage.local.get(null);
  if (s.urlDoc) $("urlDoc").value = s.urlDoc;
  if (s.cleApi) $("cleApi").value = s.cleApi;
  $("configPortail").value = s.configPortail || TEXTE_CONFIG_DEFAUT;
  if (s.delai) $("delai").value = s.delai;
  if (s.ignorerDepuisJours === 0) $("ignorerRecents").checked = false;

  $("btnConnexion").addEventListener("click", connecter);
  $("table").addEventListener("change", () => choisirTable().catch((e) => etat("etatConnexion", e.message, "erreur")));
  for (const id of ["colNom", "colNomUsage", "colPrenom", "colFiltre", "valeurFiltre"]) {
    $(id).addEventListener("change", () => sauver({ [id]: $(id).value }));
  }
  $("colFiltre").addEventListener("change", majValeursFiltre);
  for (const id of ["colNom", "colPrenom"]) $(id).addEventListener("change", majEffectif);
  $("valeurFiltre").addEventListener("input", majEffectif);
  $("btnEnregistrerPortail").addEventListener("click", enregistrerPortail);
  $("btnReglageDefaut").addEventListener("click", async () => {
    $("configPortail").value = TEXTE_CONFIG_DEFAUT;
    await chrome.storage.local.remove("configPortail");
    etat("etatPortail", "Réglage d'origine rétabli.", "ok");
  });
  $("btnTest").addEventListener("click", tester);
  $("btnLancer").addEventListener("click", lancer);
  $("btnArreter").addEventListener("click", () => {
    arretDemande = true;
    etat("etatLancement", "Arrêt après le stagiaire en cours…");
  });

  if (s.urlDoc && s.cleApi) connecter();
}

initialiser();
