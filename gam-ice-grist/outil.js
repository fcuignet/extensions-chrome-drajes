/* Page de l'outil : lecture dans GAM, comparaison avec Grist, écriture sur demande. */
"use strict";

const DEFAUTS = {
  gristUrl: "https://drajes.getgrist.com",
  docId: "wGBmTgkpqgkm",
  table: "ICE_Accueils",
  apiKey: ""
};
const GAM_URL = "https://gam.in.phm.education.gouv.fr/*";
const COLONNES_REQUISES = ["Exercice", "Departement", "Source", ...ICE.CHAMPS.map((c) => c.id)];

const $ = (id) => document.getElementById(id);
let lues = [];        // lignes lues dans GAM
let aEcrire = [];     // lignes nouvelles ou modifiées par rapport à Grist
let diagnostic = {};

// ---------- utilitaires ----------
function echapper(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function journal(message, type) {
  const li = document.createElement("li");
  li.textContent = new Date().toLocaleTimeString("fr-FR") + " — " + message;
  if (type) li.className = type;
  $("journal").appendChild(li);
  li.scrollIntoView({ block: "nearest" });
}

function verrouiller(oui) {
  for (const id of ["btnEtat", "btnLire", "btnTesterGrist", "btnEnregistrer"]) $(id).disabled = oui;
  $("btnEcrire").disabled = oui || !aEcrire.length;
}

function exercicesDeReference() {
  const d = new Date();
  const y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1; // exercice du 1er septembre au 31 août
  return { cours: y + "/" + (y + 1), precedent: (y - 1) + "/" + y };
}

function exercicesVoulus() {
  const { cours, precedent } = exercicesDeReference();
  const choix = document.querySelector("input[name=exercices]:checked").value;
  if (choix === "tous") return "tous";
  return choix === "cours" ? [cours] : [precedent, cours];
}

async function config() {
  const stockee = await chrome.storage.local.get(Object.keys(DEFAUTS));
  return { ...DEFAUTS, ...stockee };
}

// ---------- GAM ----------
async function ongletGam() {
  const onglets = await chrome.tabs.query({ url: GAM_URL });
  if (!onglets.length) throw new Error("Aucun onglet GAM ouvert : ouvrez GAM et connectez-vous.");
  return onglets.find((o) => o.active) || onglets[0];
}

async function gam(cmd, arg) {
  const onglet = await ongletGam();
  const [r] = await chrome.scripting.executeScript({
    target: { tabId: onglet.id },
    world: "MAIN",
    func: gamCommand,
    args: [cmd, arg === undefined ? null : arg]
  });
  const v = r && r.result;
  if (!v) throw new Error("GAM n'a pas répondu (onglet en cours de chargement ?).");
  if (v.erreur) throw new Error(v.erreur);
  return v;
}

async function verifierGam() {
  const etat = await gam("etat");
  const p = $("etatGam");
  if (!etat.connecte) {
    p.textContent = "Non connecté : reconnectez-vous dans l'onglet GAM.";
    p.className = "etat erreur";
    throw new Error("Vous n'êtes pas connecté à GAM.");
  }
  p.textContent = "Connecté à GAM (département affiché : " + etat.courant + ").";
  p.className = "etat ok";
  return etat;
}

// ---------- Grist ----------
async function grist(chemin, options) {
  const c = await config();
  if (!c.apiKey) throw new Error("Clé API Grist manquante (section 2).");
  const url = c.gristUrl.replace(/\/+$/, "") + "/api/docs/" + encodeURIComponent(c.docId) + chemin;
  const r = await fetch(url, {
    ...(options || {}),
    headers: { "Authorization": "Bearer " + c.apiKey, "Content-Type": "application/json" }
  });
  const texte = await r.text();
  if (!r.ok) {
    const site = c.gristUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (/invalid api key/i.test(texte)) {
      throw new Error("Grist ne reconnaît pas la clé API. Elle doit venir du même service Grist que le document (" +
        site + ", et non grist.numerique.gouv.fr) : sur " + site + ", menu du profil → Paramètres du profil → API. " +
        "Collez-la entière, puis « Enregistrer ».");
    }
    if (r.status === 401 || r.status === 403) {
      throw new Error("Grist refuse l'accès : le compte de cette clé n'a pas les droits d'édition sur le document " + c.docId + ".");
    }
    if (r.status === 404) throw new Error("Document ou table introuvable sur " + site + " (vérifiez l'identifiant du document et le nom de la table).");
    throw new Error("Grist " + r.status + " : " + texte.slice(0, 200));
  }
  return texte ? JSON.parse(texte) : {};
}

async function tableGrist() {
  return encodeURIComponent((await config()).table);
}

async function testerGrist() {
  const data = await grist("/tables/" + (await tableGrist()) + "/columns");
  const ids = data.columns.map((c) => c.id);
  const manquantes = COLONNES_REQUISES.filter((c) => !ids.includes(c));
  if (manquantes.length) throw new Error("Colonnes absentes de la table : " + manquantes.join(", "));
  return ids.length;
}

async function lignesGrist(codes) {
  const filtre = encodeURIComponent(JSON.stringify({ Departement: codes }));
  const data = await grist("/tables/" + (await tableGrist()) + "/records?filter=" + filtre);
  const index = {};
  for (const r of data.records) index[r.fields.Exercice + "|" + r.fields.Departement] = r.fields;
  return index;
}

// ---------- lecture ----------
async function lire() {
  verrouiller(true);
  lues = [];
  aEcrire = [];
  diagnostic = { date: new Date().toISOString(), version: chrome.runtime.getManifest().version };
  $("resultat").innerHTML = "<p class='aide'>Lecture en cours (le rapport peut mettre une minute à s'afficher)…</p>";
  try {
    await verifierGam();
    const voulus = exercicesVoulus();
    journal("Lecture de la statistique ICE, exercices : " + (voulus === "tous" ? "tous" : voulus.join(", ")) + "…");
    const res = await gam("statsIce", { exercices: voulus });
    const it = ICE.lireRapport(res, null, voulus === "tous" ? null : voulus);
    lues = it.lignes;
    Object.assign(diagnostic, {
      exercicesDisponibles: res.exercicesDisponibles, exercicesDemandes: res.exercicesDemandes,
      disposition: it.disposition, correspondances: it.correspondances,
      avertissements: it.avertissements, erreurs: it.erreurs, nbLignes: it.lignes.length,
      grilles: (res.grilles || []).slice(0, 4).map((g) => g.slice(0, 40)),
      texte: (res.texte || "").slice(0, 1500)
    });
    if (voulus !== "tous") {
      const absents = voulus.filter((e) => !(res.exercicesDisponibles || []).includes(e));
      if (absents.length) journal("Exercice(s) absent(s) de GAM : " + absents.join(", ") + ".", "erreur");
    }
    (it.avertissements || []).forEach((a) => journal(a, "erreur"));
    it.erreurs.forEach((e) => journal(e, "erreur"));
    const nbEx = new Set(it.lignes.map((l) => l.Exercice)).size;
    const nbDep = new Set(it.lignes.map((l) => l.Departement)).size;
    journal(it.lignes.length + " ligne(s) lue(s) : " + nbEx + " exercice(s), " + nbDep + " département(s)" +
      (it.controles ? " ; total régional contrôlé pour " + it.controles + " exercice(s)." : "."),
      it.lignes.length ? "ok" : "erreur");
    await comparer();
  } catch (e) {
    journal(e.message, "erreur");
    if (!lues.length) $("resultat").innerHTML = "<p class='aide'>Aucune donnée lue.</p>";
  } finally {
    verrouiller(false);
  }
}

// ---------- comparaison avec Grist ----------
async function comparer() {
  aEcrire = [];
  if (!lues.length) {
    $("resultat").innerHTML = "<p class='aide'>Aucune ligne exploitable. Voir le journal.</p>";
    return;
  }
  let index = null;
  try {
    index = await lignesGrist([...new Set(lues.map((l) => l.Departement))]);
  } catch (e) {
    journal("Comparaison avec Grist impossible : " + e.message, "erreur");
  }
  const entete = "<tr><th>Département</th><th>Exercice</th>" +
    ICE.CHAMPS.map((c) => "<th>" + echapper(c.libelle) + "</th>").join("") + "<th>État</th></tr>";
  const valeur = (v) => (v == null || v === "" ? null : Number(v));
  const corps = lues.map((l) => {
    const avant = index ? index[l.Exercice + "|" + l.Departement] : undefined;
    let etat = "non comparé";
    let classe = "";
    if (index) {
      if (!avant) { etat = "nouvelle ligne"; classe = "nouveau"; aEcrire.push(l); }
      else if (ICE.CHAMPS.some((c) => valeur(avant[c.id]) !== l[c.id])) {
        etat = "modifiée"; classe = "modifie"; aEcrire.push(l);
      } else etat = "identique";
    }
    const cellules = ICE.CHAMPS.map((c) => {
      const diff = avant && valeur(avant[c.id]) !== l[c.id];
      return "<td>" + echapper(l[c.id]) +
        (diff ? "<span class='avant'>avant : " + echapper(avant[c.id] == null ? "vide" : avant[c.id]) + "</span>" : "") +
        "</td>";
    }).join("");
    return "<tr class='" + classe + "'><td>" + echapper(l.Departement) + "</td><td>" + echapper(l.Exercice) +
      "</td>" + cellules + "<td>" + etat + "</td></tr>";
  }).join("");
  const resume = index
    ? aEcrire.length + " ligne(s) à écrire sur " + lues.length + " lue(s)."
    : lues.length + " ligne(s) lue(s) ; comparaison avec Grist indisponible.";
  $("resultat").innerHTML = "<p>" + resume + "</p><table>" + entete + corps + "</table>";
  $("btnEcrire").textContent = aEcrire.length ? "Écrire " + aEcrire.length + " ligne(s) dans Grist" : "Écrire dans Grist";
  $("btnEcrire").disabled = !aEcrire.length;
}

// ---------- écriture ----------
async function ecrire() {
  if (!aEcrire.length) return;
  verrouiller(true);
  try {
    await testerGrist();
    const source = "GAM – extension (synchro du " + new Date().toLocaleDateString("fr-FR") + ")";
    const records = aEcrire.map((l) => {
      const fields = { Source: source };
      for (const c of ICE.CHAMPS) fields[c.id] = l[c.id];
      return { require: { Exercice: l.Exercice, Departement: l.Departement }, fields };
    });
    const table = await tableGrist();
    for (let i = 0; i < records.length; i += 100) {
      await grist("/tables/" + table + "/records", {
        method: "PUT",
        body: JSON.stringify({ records: records.slice(i, i + 100) })
      });
    }
    journal(records.length + " ligne(s) envoyée(s) à Grist. Vérification…", "ok");
    await comparer();
    if (aEcrire.length) journal("Vérification : " + aEcrire.length + " ligne(s) encore différente(s) dans Grist.", "erreur");
    else journal("Vérification : Grist est à jour pour toutes les lignes lues.", "ok");
  } catch (e) {
    journal("Écriture interrompue : " + e.message, "erreur");
  } finally {
    verrouiller(false);
  }
}

// ---------- initialisation ----------
async function initialiser() {
  const { cours, precedent } = exercicesDeReference();
  document.querySelectorAll(".exCours").forEach((e) => { e.textContent = cours; });
  document.querySelectorAll(".exPrec").forEach((e) => { e.textContent = precedent + " et " + cours; });

  const c = await config();
  for (const k of Object.keys(DEFAUTS)) $(k).value = c[k];

  // Enregistre les champs ; la clé est nettoyée (espaces, guillemets, « Bearer » collés par mégarde).
  async function enregistrer() {
    const valeurs = {};
    for (const k of Object.keys(DEFAUTS)) valeurs[k] = $(k).value.trim();
    valeurs.apiKey = valeurs.apiKey.replace(/^bearer\s+/i, "").replace(/[\s"'«»​-‍﻿]/g, "");
    valeurs.gristUrl = valeurs.gristUrl.replace(/\/+$/, "");
    $("apiKey").value = valeurs.apiKey;
    await chrome.storage.local.set(valeurs);
  }

  $("btnEnregistrer").addEventListener("click", async () => {
    await enregistrer();
    $("etatGrist").textContent = "Paramètres enregistrés.";
    $("etatGrist").className = "etat ok";
  });

  $("btnTesterGrist").addEventListener("click", async () => {
    try {
      await enregistrer(); // teste toujours la clé affichée, même si « Enregistrer » a été oublié
      const n = await testerGrist();
      $("etatGrist").textContent = "Accès à la table vérifié (" + n + " colonnes).";
      $("etatGrist").className = "etat ok";
    } catch (e) {
      $("etatGrist").textContent = e.message;
      $("etatGrist").className = "etat erreur";
    }
  });

  $("btnEtat").addEventListener("click", () => verifierGam().catch((e) => journal(e.message, "erreur")));
  $("btnLire").addEventListener("click", () => lire());
  $("btnEcrire").addEventListener("click", ecrire);
  $("btnDiag").addEventListener("click", async () => {
    await navigator.clipboard.writeText(JSON.stringify(diagnostic, null, 1));
    journal("Diagnostic copié dans le presse-papiers.", "ok");
  });

  verifierGam().catch(() => {});
}

initialiser();
