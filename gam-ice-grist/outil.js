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
  for (const id of ["btnEtat", "btnApercu", "btnTous", "btnTesterGrist", "btnEnregistrer"]) $(id).disabled = oui;
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
  p.textContent = "Connecté. Département affiché : " + etat.courant + ". Départements accessibles : " +
    etat.departements.map((d) => d.code).join(", ") + ".";
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
    if (r.status === 401 || r.status === 403) throw new Error("Grist refuse l'accès (clé API ou droits sur le document).");
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
async function lire(tousLesDepartements) {
  verrouiller(true);
  lues = [];
  aEcrire = [];
  diagnostic = { date: new Date().toISOString(), version: chrome.runtime.getManifest().version, departements: [] };
  $("resultat").innerHTML = "<p class='aide'>Lecture en cours…</p>";
  try {
    const etat = await verifierGam();
    const initial = etat.courant;
    const cibles = tousLesDepartements ? etat.departements : etat.departements.filter((d) => d.libelle === initial);
    if (!cibles.length) throw new Error("Département affiché non reconnu : " + initial);
    const voulus = exercicesVoulus();
    journal("Lecture de " + cibles.length + " département(s), exercices : " +
      (voulus === "tous" ? "tous" : voulus.join(", ")) + ".");
    try {
      for (const d of cibles) {
        if (tousLesDepartements) await gam("choisirDepartement", d.libelle);
        const res = await gam("statsIce", { exercices: voulus });
        const it = ICE.lireRapport(res, d.code, voulus === "tous" ? null : voulus);
        lues.push(...it.lignes);
        diagnostic.departements.push({
          departement: d.libelle, code: d.code,
          exercicesDisponibles: res.exercicesDisponibles, exercicesDemandes: res.exercicesDemandes,
          disposition: it.disposition, correspondances: it.correspondances,
          ambiguites: it.ambiguites, erreurs: it.erreurs, lignes: it.lignes,
          grilles: (res.grilles || []).slice(0, 4).map((g) => g.slice(0, 30)),
          csv: res.csv ? res.csv.slice(0, 3000) : null,
          texte: (res.texte || "").slice(0, 1500)
        });
        it.ambiguites.forEach((a) => journal(d.libelle + " : " + a));
        it.erreurs.forEach((e) => journal(d.libelle + " : " + e, "erreur"));
        journal(d.libelle + " (" + d.code + ") : " + it.lignes.length + " exercice(s) lu(s).",
          it.lignes.length ? "ok" : "erreur");
      }
    } finally {
      if (tousLesDepartements && initial) {
        try {
          await gam("choisirDepartement", initial);
          journal("Département d'origine remis dans GAM : " + initial + ".");
        } catch (e) {
          journal("Impossible de remettre le département d'origine : " + e.message, "erreur");
        }
      }
    }
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

  $("btnEnregistrer").addEventListener("click", async () => {
    const valeurs = {};
    for (const k of Object.keys(DEFAUTS)) valeurs[k] = $(k).value.trim();
    await chrome.storage.local.set(valeurs);
    $("etatGrist").textContent = "Paramètres enregistrés.";
    $("etatGrist").className = "etat ok";
  });

  $("btnTesterGrist").addEventListener("click", async () => {
    try {
      const n = await testerGrist();
      $("etatGrist").textContent = "Accès à la table vérifié (" + n + " colonnes).";
      $("etatGrist").className = "etat ok";
    } catch (e) {
      $("etatGrist").textContent = e.message;
      $("etatGrist").className = "etat erreur";
    }
  });

  $("btnEtat").addEventListener("click", () => verifierGam().catch((e) => journal(e.message, "erreur")));
  $("btnApercu").addEventListener("click", () => lire(false));
  $("btnTous").addEventListener("click", () => lire(true));
  $("btnEcrire").addEventListener("click", ecrire);
  $("btnDiag").addEventListener("click", async () => {
    await navigator.clipboard.writeText(JSON.stringify(diagnostic, null, 1));
    journal("Diagnostic copié dans le presse-papiers.", "ok");
  });

  verifierGam().catch(() => {});
}

initialiser();
