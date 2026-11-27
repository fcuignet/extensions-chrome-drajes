// Interrogation du portail public recherche-educateur.sports.gouv.fr.
//
// Le portail est une application JavaScript qui appelle une API non documentée :
//   POST https://eme-api-core.sports.gouv.fr/api/Educateur/RecherchePublic
// (repérée le 25/11/2026 en observant une recherche sur le portail). Le réglage par défaut
// ci-dessous reproduit exactement cet appel. Si le portail évolue, on modifie le réglage
// dans la page de l'extension, sans toucher au code.

export const URL_FICHE_CARTE = "https://recherche-educateur.sports.gouv.fr/CartePro/";
const HOTES_AUTORISES = ["eme-api-core.sports.gouv.fr", "recherche-educateur.sports.gouv.fr"];

export const CONFIG_PAR_DEFAUT = {
  url: "https://eme-api-core.sports.gouv.fr/api/Educateur/RecherchePublic",
  methode: "POST",
  corps: {
    numeroPage: 0,
    itemByPage: 20,
    nomFamille: "{nom}",
    prenom: "{prenom}",
    cartePro: null,
    typeUser: "EducUser",
  },
  cheminListe: "results",
  champErreur: "errorCode",
  champMessageErreur: "errorMessage",
  champs: {
    nom: "nomFamille",
    prenom: "prenom",
    numero: "cartePro",
    identifiant: "identifiant",
    stagiaire: "isStagiaire",
    lps: "isLPS",
  },
};

export function lienCarte(numero) {
  return numero ? URL_FICHE_CARTE + encodeURIComponent(numero) : "";
}

/** Lit une valeur imbriquée : lire({a:{b:1}}, "a.b") → 1. Un chemin vide renvoie l'objet. */
export function lire(objet, chemin) {
  if (!chemin) return objet;
  return String(chemin)
    .split(".")
    .reduce((o, cle) => (o == null ? undefined : o[cle]), objet);
}

/** Convertit une date du portail (ISO, jj/mm/aaaa, horodatage) en Date, ou null. */
export function lireDate(valeur) {
  if (valeur == null || valeur === "") return null;
  if (typeof valeur === "number") {
    return new Date(valeur > 1e12 ? valeur : valeur * 1000);
  }
  const s = String(valeur).trim();
  const fr = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (fr) return new Date(Number(fr[3]), Number(fr[2]) - 1, Number(fr[1]));
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function remplacerDansObjet(modele, valeurs) {
  if (typeof modele === "string") {
    return modele.replace(/\{(nom|prenom)\}/g, (_, cle) => valeurs[cle]);
  }
  if (Array.isArray(modele)) return modele.map((v) => remplacerDansObjet(v, valeurs));
  if (modele && typeof modele === "object") {
    return Object.fromEntries(Object.entries(modele).map(([k, v]) => [k, remplacerDansObjet(v, valeurs)]));
  }
  return modele;
}

/** Vérifie la cohérence du réglage ; renvoie la liste des problèmes (vide si tout va bien). */
export function problemesConfig(cfg) {
  const problemes = [];
  if (!cfg || typeof cfg !== "object") return ["Le réglage du portail est vide."];
  if (!cfg.url) problemes.push("« url » manquant.");
  else {
    try {
      const u = new URL(cfg.url.replace(/\{(nom|prenom)\}/g, "x"));
      if (!HOTES_AUTORISES.includes(u.hostname)) {
        problemes.push(`L'adresse doit viser ${HOTES_AUTORISES.join(" ou ")}.`);
      }
    } catch {
      problemes.push("« url » n'est pas une adresse valide.");
    }
  }
  if (!cfg.champs || !cfg.champs.nom || !cfg.champs.prenom) {
    problemes.push("« champs.nom » et « champs.prenom » sont obligatoires.");
  }
  if (cfg.methode && !["GET", "POST"].includes(String(cfg.methode).toUpperCase())) {
    problemes.push("« methode » doit valoir GET ou POST.");
  }
  return problemes;
}

/**
 * Fabrique la fonction de recherche à partir du réglage.
 * rechercher(nom, prenom) →
 *   [{ nom, prenom, numero, identifiant, stagiaire, lps, expiration (Date|null), delivrePar, brut }]
 */
export function creerRecherche(cfg, fetchFn) {
  const probs = problemesConfig(cfg);
  if (probs.length) throw new Error("Réglage du portail incomplet : " + probs.join(" "));
  const appel = fetchFn || globalThis.fetch.bind(globalThis);
  const methode = String(cfg.methode || "GET").toUpperCase();
  const c = cfg.champs;
  const texte = (item, chemin) => (chemin ? String(lire(item, chemin) ?? "") : "");

  return async function rechercher(nom, prenom) {
    const valeurs = { nom, prenom };
    const url = cfg.url.replace(/\{(nom|prenom)\}/g, (_, cle) => encodeURIComponent(valeurs[cle]));
    const init = { method: methode, headers: { Accept: "application/json", ...(cfg.entetes || {}) } };
    if (methode === "POST" && cfg.corps !== undefined) {
      init.body = JSON.stringify(remplacerDansObjet(cfg.corps, valeurs));
      if (!Object.keys(init.headers).some((h) => h.toLowerCase() === "content-type")) {
        init.headers["Content-Type"] = "application/json";
      }
    }
    const rep = await appel(url, init);
    if (rep.status === 404 && cfg.vide404) return [];
    if (!rep.ok) throw new Error(`Portail : erreur HTTP ${rep.status}`);
    const json = await rep.json();
    if (cfg.champErreur) {
      const code = lire(json, cfg.champErreur);
      if (code !== null && code !== undefined && code !== "") {
        const message = cfg.champMessageErreur ? lire(json, cfg.champMessageErreur) : "";
        throw new Error(`Portail : ${message || "erreur " + code}`);
      }
    }
    let liste = lire(json, cfg.cheminListe || "");
    if (liste == null) return [];
    if (!Array.isArray(liste)) liste = [liste];
    return liste.map((item) => ({
      nom: texte(item, c.nom),
      prenom: texte(item, c.prenom),
      numero: texte(item, c.numero),
      identifiant: texte(item, c.identifiant),
      stagiaire: c.stagiaire ? Boolean(lire(item, c.stagiaire)) : false,
      lps: c.lps ? Boolean(lire(item, c.lps)) : false,
      expiration: c.expiration ? lireDate(lire(item, c.expiration)) : null,
      delivrePar: texte(item, c.delivrePar),
      brut: item,
    }));
  };
}
