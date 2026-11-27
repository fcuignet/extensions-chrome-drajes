// Logique de contrôle : essais de recherche, rapprochement des résultats, statut à écrire.
import { lienCarte } from "./portail.js";

export const STATUTS = {
  CARTE: "Carte pro",
  STAGIAIRE: "Stagiaire déclaré",
  EXPIREE: "Carte expirée",
  A_VERIFIER: "À vérifier",
  NON_TROUVE: "Non trouvé",
  ERREUR: "Erreur",
};
const STATUTS_TROUVE = [STATUTS.CARTE, STATUTS.STAGIAIRE, STATUTS.EXPIREE];

/** Majuscules, sans accents, tirets et apostrophes remplacés par des espaces. */
export function normaliser(texte) {
  return String(texte ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Premier prénom d'une liste (« Jean-Baptiste Marie » → « Jean-Baptiste »). */
export function premierPrenom(prenom) {
  return String(prenom ?? "").trim().split(/[\s,;]+/)[0] || "";
}

/**
 * Combinaisons à essayer, dans l'ordre, sans doublon :
 * nom de naissance + prénoms, nom de naissance + premier prénom,
 * puis les mêmes avec le nom d'usage s'il est différent,
 * enfin nom + deux premières lettres du prénom (le portail cherche par début de prénom :
 * une variante comme Cathy / Catherine ressort alors en « À vérifier » au lieu de « Non trouvé »).
 */
export function essais(nomNaissance, nomUsage, prenom) {
  const liste = [];
  const vus = new Set();
  const ajouter = (nom, pre, origine) => {
    const n = String(nom ?? "").trim();
    const p = String(pre ?? "").trim();
    if (!n || !p) return;
    const cle = normaliser(n) + "|" + normaliser(p);
    if (vus.has(cle)) return;
    vus.add(cle);
    liste.push({ nom: n, prenom: p, origine });
  };
  ajouter(nomNaissance, prenom, "nom de naissance");
  ajouter(nomNaissance, premierPrenom(prenom), "nom de naissance, premier prénom");
  ajouter(nomUsage, prenom, "nom d'usage");
  ajouter(nomUsage, premierPrenom(prenom), "nom d'usage, premier prénom");
  const debut = premierPrenom(prenom).slice(0, 2);
  if (debut.length === 2 && premierPrenom(prenom).length > 2) {
    ajouter(nomNaissance, debut, "nom de naissance, début du prénom");
    ajouter(nomUsage, debut, "nom d'usage, début du prénom");
  }
  return liste;
}

function debutDuJour(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function prenomCorrespond(prenomPortail, prenomCherche) {
  const a = normaliser(prenomPortail);
  const b = normaliser(prenomCherche);
  return a === b || a.startsWith(b + " ") || b.startsWith(a + " ");
}

/** Regroupe les fiches d'une même personne (même identifiant portail). */
function regrouperParPersonne(fiches) {
  const groupes = new Map();
  fiches.forEach((f, i) => {
    const cle = f.identifiant || f.numero || `#${i}`;
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(f);
  });
  return [...groupes.values()];
}

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

/** Un nom composé d'un côté et l'une de ses parties de l'autre (VELLARD-EBY / VELLARD). */
function nomPartiel(nomPortail, nomGrist) {
  const a = normaliser(nomPortail).split(" ").filter(Boolean);
  const b = normaliser(nomGrist).split(" ").filter(Boolean);
  if (!a.length || !b.length || a.length === b.length) return false;
  const [petit, grand] = a.length < b.length ? [a, b] : [b, a];
  return petit.every((t) => grand.includes(t));
}

/**
 * Compare une fiche du portail à l'identité du stagiaire dans Grist (noms de naissance et d'usage, prénoms).
 * Renvoie null si ce n'est pas la même personne, "" si la correspondance est exacte,
 * ou une note si elle est partielle mais sûre (nom composé, prénom composé, une lettre d'écart).
 */
export function correspondance(fiche, identite) {
  const noms = identite.noms.filter((n) => normaliser(n));
  const prenomGrist = normaliser(identite.prenom);
  const prenomPortail = normaliser(fiche.prenom);
  const notes = [];
  let nomOk = noms.some((n) => normaliser(n) === normaliser(fiche.nom));
  if (!nomOk && noms.some((n) => nomPartiel(fiche.nom, n))) {
    nomOk = true;
    notes.push("nom composé partiel");
  }
  if (!nomOk) return null;
  let prenomOk = prenomPortail === prenomGrist;
  if (!prenomOk && prenomCorrespond(fiche.prenom, identite.prenom)) {
    prenomOk = true;
    notes.push("prénom composé partiel");
  }
  if (!prenomOk && prenomGrist.length >= 5 && distance(prenomPortail, prenomGrist) === 1) {
    prenomOk = true;
    notes.push("prénom à une lettre près");
  }
  if (!prenomOk) return null;
  return notes.length ? `Correspondance partielle (${notes.join(", ")}) : ${fiche.prenom} ${fiche.nom}` : "";
}

/**
 * Classe les résultats d'une recherche pour un essai donné.
 * Avec `identite` ({ noms, prenom }), la comparaison se fait sur l'identité complète du stagiaire
 * (et non sur les termes de la recherche), ce qui reconnaît les noms et prénoms composés.
 */
export function classer(essai, resultats, aujourdHui = new Date(), identite = null) {
  const ident = identite || { noms: [essai.nom], prenom: essai.prenom };
  const notes = new Map();
  const exacts = resultats.filter((r) => {
    let note = correspondance(r, ident);
    if (note === null && identite) note = correspondance(r, { noms: [essai.nom], prenom: essai.prenom });
    if (note === null) return false;
    notes.set(r, note);
    return true;
  });
  const personnes = regrouperParPersonne(exacts);
  if (personnes.length === 1) {
    const fiches = personnes[0];
    // Une carte professionnelle prime sur une attestation de stagiaire.
    const carte = fiches.find((f) => !f.stagiaire) || fiches[0];
    const partiel = notes.get(carte) || "";
    if (carte.stagiaire) return { statut: STATUTS.STAGIAIRE, carte, fiches, partiel };
    if (carte.expiration && carte.expiration < debutDuJour(aujourdHui)) {
      return { statut: STATUTS.EXPIREE, carte, fiches, partiel };
    }
    return { statut: STATUTS.CARTE, carte, fiches, partiel };
  }
  if (personnes.length > 1) {
    return { statut: STATUTS.A_VERIFIER, cartes: exacts, note: `${personnes.length} homonymes sur le portail` };
  }
  if (resultats.length > 0) {
    return {
      statut: STATUTS.A_VERIFIER,
      cartes: resultats,
      note: `${resultats.length} résultat(s) approchant(s), aucun identique`,
    };
  }
  return { statut: STATUTS.NON_TROUVE };
}

/**
 * Vérifie un stagiaire : enchaîne les essais jusqu'à un résultat certain.
 * Renvoie { statut, carte?, cartes?, note, essai? }.
 */
export async function verifierStagiaire(ligne, { rechercher, attendre, delaiMs, aujourdHui }) {
  const liste = essais(ligne.nomNaissance, ligne.nomUsage, ligne.prenom);
  if (!liste.length) return { statut: STATUTS.ERREUR, note: "Nom ou prénom manquant dans Grist" };
  const identite = { noms: [ligne.nomNaissance, ligne.nomUsage], prenom: ligne.prenom };
  let incertain = null;
  for (const essai of liste) {
    let resultats;
    try {
      resultats = await rechercher(essai.nom, essai.prenom);
    } catch (e) {
      return { statut: STATUTS.ERREUR, note: e.message };
    } finally {
      await attendre(delaiMs);
    }
    const c = classer(essai, resultats, aujourdHui, identite);
    if (STATUTS_TROUVE.includes(c.statut)) {
      const morceaux = [];
      if (essai !== liste[0]) morceaux.push(`Trouvé avec : ${essai.origine}`);
      if (c.partiel) morceaux.push(c.partiel);
      return { ...c, essai, note: morceaux.join(" – ") };
    }
    if (c.cartes && c.note.includes("homonymes")) return { ...c, essai };
    if (c.statut === STATUTS.A_VERIFIER && !incertain) incertain = { ...c, essai };
  }
  if (incertain) return incertain;
  return {
    statut: STATUTS.NON_TROUVE,
    note: `Essais : ${liste.map((e) => `${e.nom} ${e.prenom}`).join(" ; ")}`,
  };
}

/** Date au format attendu par une colonne Date de Grist (secondes, minuit UTC). */
export function dateGrist(date) {
  if (!date) return null;
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 1000;
}

function decrireFiche(c) {
  const mentions = [c.stagiaire ? "stagiaire" : "", c.lps ? "LPS" : ""].filter(Boolean).join(", ");
  return `${c.prenom} ${c.nom}${c.numero ? " (" + c.numero + ")" : ""}${mentions ? " [" + mentions + "]" : ""}`;
}

/** Champs à écrire dans Grist pour un résultat. */
export function champsResultat(resultat, aujourdHui = new Date()) {
  const carte = resultat.carte;
  const numeros = carte
    ? carte.numero
    : (resultat.cartes || []).map((c) => c.numero).filter(Boolean).join(", ");
  const morceaux = [];
  if (resultat.note) morceaux.push(resultat.note);
  if (resultat.cartes && resultat.cartes.length) {
    morceaux.push(resultat.cartes.slice(0, 5).map(decrireFiche).join(" ; "));
  }
  if (carte) {
    const autres = (resultat.fiches || []).filter((f) => f !== carte);
    if (carte.stagiaire) morceaux.push(carte.numero ? "Attestation de stagiaire" : "Attestation de stagiaire (le portail n'affiche pas de n°)");
    if (carte.lps) morceaux.push("Libre prestation de services (LPS)");
    if (carte.delivrePar) morceaux.push(`Délivrée par ${carte.delivrePar}`);
    if (autres.length) morceaux.push(`Autre fiche : ${autres.map(decrireFiche).join(" ; ")}`);
  }
  return {
    CartePro_Statut: resultat.statut,
    CartePro_Numero: numeros || "",
    CartePro_Lien: carte && carte.numero ? lienCarte(carte.numero) : "",
    CartePro_Detail: morceaux.join(" – "),
    CartePro_Verifie_le: dateGrist(aujourdHui),
  };
}

/**
 * Sélectionne les lignes Grist à contrôler et les met au format attendu.
 * options : { colNom, colNomUsage, colPrenom, colFiltre, valeurFiltre, ignorerDepuisJours, aujourdHui }
 */
export function preparerLignes(enregistrements, options) {
  const { colNom, colNomUsage, colPrenom, colFiltre, valeurFiltre, ignorerDepuisJours, aujourdHui = new Date() } = options;
  const seuil = ignorerDepuisJours ? dateGrist(aujourdHui) - ignorerDepuisJours * 86400 : null;
  const filtre = colFiltre && valeurFiltre !== undefined && String(valeurFiltre).trim() !== ""
    ? normaliser(valeurFiltre)
    : null;
  return enregistrements
    .filter((r) => !filtre || normaliser(r.fields[colFiltre]) === filtre)
    .filter((r) => {
      if (seuil === null) return true;
      const v = r.fields.CartePro_Verifie_le;
      return !(typeof v === "number" && v >= seuil);
    })
    .map((r) => ({
      id: r.id,
      nomNaissance: r.fields[colNom],
      nomUsage: colNomUsage ? r.fields[colNomUsage] : "",
      prenom: r.fields[colPrenom],
    }));
}

/** Valeurs distinctes d'une colonne (pour proposer la liste des sessions). */
export function valeursDistinctes(enregistrements, colonne, max = 500) {
  const vus = new Set();
  for (const r of enregistrements) {
    const v = r.fields[colonne];
    if (v !== null && v !== undefined && String(v).trim() !== "") vus.add(String(v).trim());
    if (vus.size >= max) break;
  }
  return [...vus].sort((a, b) => a.localeCompare(b, "fr"));
}

/**
 * Boucle principale. Appelle surResultat(ligne, resultat, champs, rang) après chaque stagiaire
 * et ecrire(lot) tous les `tailleLot` stagiaires, puis à la fin (ou à l'arrêt).
 */
export async function verifierLignes({
  lignes,
  rechercher,
  attendre,
  delaiMs = 1500,
  tailleLot = 10,
  ecrire,
  surResultat,
  doitArreter = () => false,
  aujourdHui = new Date(),
}) {
  const bilan = { total: lignes.length, traites: 0, parStatut: {}, nonTrouves: [], arrete: false };
  let lot = [];
  const vider = async () => {
    if (lot.length && ecrire) await ecrire(lot);
    lot = [];
  };
  for (const [rang, ligne] of lignes.entries()) {
    if (doitArreter()) {
      bilan.arrete = true;
      break;
    }
    const resultat = await verifierStagiaire(ligne, { rechercher, attendre, delaiMs, aujourdHui });
    const champs = champsResultat(resultat, aujourdHui);
    lot.push({ id: ligne.id, fields: champs });
    bilan.traites += 1;
    bilan.parStatut[resultat.statut] = (bilan.parStatut[resultat.statut] || 0) + 1;
    if (resultat.statut === STATUTS.NON_TROUVE) bilan.nonTrouves.push(ligne);
    if (surResultat) await surResultat(ligne, resultat, champs, rang);
    if (lot.length >= tailleLot) await vider();
  }
  await vider();
  return bilan;
}
