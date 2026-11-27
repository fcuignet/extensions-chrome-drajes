/*
 * Lecture du rapport « Stats ICE » de GAM.
 * Le rapport donne une ligne par exercice et par département de la région, puis une
 * ligne « Total région » par exercice :
 *   Exercices | Régions | Départements | accueil avec hébergement | accueil de scoutisme |
 *   accueil sans hébergement - Accueil de jeunes | - Accueil de loisirs | - Accueil périscolaire | Total Accueils
 * Les colonnes sont repérées par leur libellé. Une ligne n'est retenue que si ses cinq
 * comptages sont des nombres ; la somme des départements est comparée au total régional.
 */
(function (racine) {
  "use strict";

  const EX = /^(\d{4})\s*[\/-]\s*(\d{4})$/;

  const DEPARTEMENTS = {
    "ardennes": "08", "aube": "10", "marne": "51", "haute-marne": "52",
    "meurthe-et-moselle": "54", "meuse": "55", "moselle": "57",
    "bas-rhin": "67", "haut-rhin": "68", "vosges": "88"
  };

  const CHAMPS = [
    { id: "Avec_hebergement", libelle: "Avec hébergement", re: /avec\s+heberg/ },
    { id: "Scoutisme", libelle: "Scoutisme", re: /scout/ },
    { id: "ASH_Jeunes", libelle: "Sans héb. – accueil de jeunes", re: /jeune/, sansHeb: true },
    { id: "ASH_Loisirs", libelle: "Sans héb. – accueil de loisirs", re: /loisir/, sansHeb: true },
    { id: "ASH_Periscolaire", libelle: "Sans héb. – périscolaire", re: /peri\s*-?\s*scol/, sansHeb: true }
  ];

  // Libellés à ne jamais prendre pour un nombre d'accueils.
  const EXCLU = /total|cumul|taux|%|control|visite|evalu|inspect|effectif|nombre de mineurs|nb mineurs/;

  function normLab(s) {
    return String(s == null ? "" : s)
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[’']/g, " ").replace(/\s+/g, " ").trim();
  }

  function exercice(s) {
    const m = String(s == null ? "" : s).trim().match(EX);
    return m ? m[1] + "/" + m[2] : null;
  }

  // Entier ; 0 pour une cellule vide ou « - » ; null si la cellule n'est pas un nombre.
  function nombre(s) {
    const t = String(s == null ? "" : s).replace(/[\s  ]/g, "");
    if (t === "" || t === "-") return 0;
    return /^\d+$/.test(t) ? parseInt(t, 10) : null;
  }

  function estNombreRenseigne(s) {
    const t = String(s == null ? "" : s).trim();
    return t !== "" && nombre(t) !== null;
  }

  function codeDepartement(libelle) {
    return DEPARTEMENTS[normLab(libelle).replace(/\s+/g, "-")] || null;
  }

  // Pour chaque champ, l'indice du premier libellé qui lui correspond.
  function associer(libelles) {
    const index = {};
    const correspondances = {};
    const ambiguites = [];
    for (const ch of CHAMPS) {
      const trouves = libelles
        .map((l, k) => ({ l, k }))
        .filter(({ l }) => l && ch.re.test(l) && !EXCLU.test(l)
          && (ch.id === "Scoutisme" || !/scout/.test(l))
          && (!ch.sansHeb || !/avec\s+heberg/.test(l)));
      if (trouves.length) {
        index[ch.id] = trouves[0].k;
        correspondances[ch.id] = trouves[0].l;
        if (trouves.length > 1) {
          ambiguites.push(ch.libelle + " : plusieurs colonnes possibles (" +
            trouves.map((x) => "« " + x.l + " »").join(", ") + "), la première est retenue.");
        }
      }
    }
    return { index, correspondances, ambiguites };
  }

  function interpreter(grille, codeParDefaut, voulus) {
    const g = (grille || []).map((r) => (r || []).map((c) => String(c == null ? "" : c).trim()));
    const res = { lignes: [], erreurs: [], avertissements: [], disposition: null, correspondances: {} };
    if (!g.length) return res;
    const nbCol = Math.max(...g.map((r) => r.length));

    // Lignes de données : un exercice et au moins deux nombres.
    const lignesEx = g.map((r, i) => ({ i, j: r.findIndex((c) => exercice(c)) }))
      .filter(({ i, j }) => j >= 0 && g[i].filter((c, k) => k !== j && estNombreRenseigne(c)).length >= 2);
    if (!lignesEx.length) return res;

    // Libellés de colonnes : concaténation des lignes d'en-tête (titre pleine largeur ignoré).
    const entetes = g.slice(0, lignesEx[0].i).filter((r) => {
      const pleine = r.length === nbCol && r.every((c) => c);
      return !(pleine && new Set(r).size === 1);
    });
    const libelles = [];
    for (let c = 0; c < nbCol; c += 1) {
      const parts = [];
      for (const r of entetes) {
        const v = r[c] || "";
        if (v && !parts.includes(v)) parts.push(v);
      }
      libelles.push(normLab(parts.join(" ")));
    }
    const { index, correspondances, ambiguites } = associer(libelles);
    res.disposition = "un exercice par ligne";
    res.correspondances = correspondances;
    res.avertissements.push(...ambiguites);
    const manquants = CHAMPS.filter((ch) => !(ch.id in index)).map((ch) => ch.libelle);
    if (manquants.length) {
      res.erreurs.push("Colonnes introuvables dans le rapport : " + manquants.join(", ") + ".");
      return res;
    }
    const colDep = libelles.findIndex((l) => /departement/.test(l));
    if (colDep < 0 && !codeParDefaut) {
      res.erreurs.push("Colonne « Départements » introuvable dans le rapport.");
      return res;
    }

    const vus = new Set();
    const totaux = {};
    const sommes = {};
    for (const { i, j } of lignesEx) {
      const ex = exercice(g[i][j]);
      if (voulus && !voulus.includes(ex)) continue;
      const libDep = colDep >= 0 ? g[i][colDep] : "";
      const valeurs = {};
      const invalides = [];
      for (const ch of CHAMPS) {
        const v = nombre(g[i][index[ch.id]]);
        if (v === null) invalides.push(ch.libelle + " = « " + g[i][index[ch.id]] + " »");
        valeurs[ch.id] = v;
      }
      if (/total/i.test(normLab(libDep))) {
        if (!invalides.length) totaux[ex] = valeurs;
        continue;
      }
      const code = colDep >= 0 ? codeDepartement(libDep) : codeParDefaut;
      if (!code) {
        res.erreurs.push(ex + " : département non reconnu « " + libDep + " », ligne ignorée.");
        continue;
      }
      const cle = ex + "|" + code;
      if (vus.has(cle)) continue;
      vus.add(cle);
      if (invalides.length) {
        res.erreurs.push(ex + " – " + (libDep || code) + " : valeur non numérique (" + invalides.join(", ") + ").");
        continue;
      }
      res.lignes.push({ Exercice: ex, Departement: code, ...valeurs });
      sommes[ex] = sommes[ex] || Object.fromEntries(CHAMPS.map((ch) => [ch.id, 0]));
      for (const ch of CHAMPS) sommes[ex][ch.id] += valeurs[ch.id];
    }

    // Contrôle : somme des départements = total régional du rapport.
    for (const ex of Object.keys(totaux)) {
      const ecarts = CHAMPS.filter((ch) => !sommes[ex] || sommes[ex][ch.id] !== totaux[ex][ch.id])
        .map((ch) => ch.libelle + " : " + (sommes[ex] ? sommes[ex][ch.id] : 0) + " pour " + totaux[ex][ch.id]);
      if (ecarts.length) res.avertissements.push(ex + " : la somme des départements diffère du total régional (" + ecarts.join(" ; ") + ").");
    }
    res.controles = Object.keys(totaux).length;
    return res;
  }

  // Essaie chaque tableau du rapport et garde la lecture la plus complète.
  function lireRapport(resultat, codeParDefaut, voulus) {
    let meilleur = null;
    for (const grille of (resultat && resultat.grilles) || []) {
      const it = interpreter(grille, codeParDefaut, voulus);
      if (it.lignes.length && (!meilleur || it.lignes.length > meilleur.lignes.length)) meilleur = it;
      if (!meilleur && it.erreurs.length) meilleur = it;
    }
    return meilleur || {
      lignes: [], disposition: null, correspondances: {}, avertissements: [],
      erreurs: ["Format du rapport non reconnu. Utilisez « Copier le diagnostic » et transmettez-le."]
    };
  }

  const api = { CHAMPS, DEPARTEMENTS, interpreter, lireRapport, exercice, nombre, normLab, codeDepartement };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else racine.ICE = api;
})(typeof window !== "undefined" ? window : globalThis);
