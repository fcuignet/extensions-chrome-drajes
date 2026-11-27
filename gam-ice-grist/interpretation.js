/*
 * Lecture du rapport « Stats ICE » : à partir d'une grille (tableau de lignes de textes),
 * retrouve pour chaque exercice les cinq comptages attendus par la table Grist ICE_Accueils.
 * Deux dispositions sont reconnues : un exercice par ligne, ou un exercice par colonne.
 * Les colonnes (ou lignes) sont repérées par leur libellé ; un comptage non trouvé ou
 * non numérique empêche l'écriture de la ligne correspondante.
 */
(function (racine) {
  "use strict";

  const EX = /^(\d{4})\s*[\/-]\s*(\d{4})$/;

  const CHAMPS = [
    { id: "Scoutisme", libelle: "Scoutisme", re: /scout/ },
    { id: "ASH_Jeunes", libelle: "Sans héb. – accueil de jeunes", re: /jeune/, sansHeb: true },
    { id: "ASH_Loisirs", libelle: "Sans héb. – accueil de loisirs", re: /loisir/, sansHeb: true },
    { id: "ASH_Periscolaire", libelle: "Sans héb. – périscolaire", re: /peri\s*-?\s*scol/, sansHeb: true },
    { id: "Avec_hebergement", libelle: "Avec hébergement", re: /avec\s+heberg/ }
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

  // Entier, 0 pour une cellule vide ou « - », null si la cellule n'est pas un nombre.
  function nombre(s) {
    const t = String(s == null ? "" : s).replace(/[\s  ]/g, "");
    if (t === "" || t === "-") return 0;
    return /^\d+$/.test(t) ? parseInt(t, 10) : null;
  }

  function estNombreRenseigne(s) {
    const t = String(s == null ? "" : s).trim();
    return t !== "" && nombre(t) !== null;
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
          ambiguites.push(ch.libelle + " : plusieurs libellés possibles (" +
            trouves.map((x) => "« " + x.l + " »").join(", ") + "), le premier est retenu.");
        }
      }
    }
    return { index, correspondances, ambiguites };
  }

  function construire(exercicesEtValeurs, code, voulus, manquants) {
    const lignes = [];
    const erreurs = [];
    const vus = new Set();
    for (const { ex, valeurs } of exercicesEtValeurs) {
      if (!ex || vus.has(ex)) continue;
      if (voulus && !voulus.includes(ex)) continue;
      vus.add(ex);
      if (manquants.length) {
        erreurs.push(ex + " : comptage introuvable (" + manquants.join(", ") + ").");
        continue;
      }
      const ligne = { Exercice: ex, Departement: code };
      const invalides = [];
      for (const ch of CHAMPS) {
        const v = nombre(valeurs[ch.id]);
        if (v === null) invalides.push(ch.libelle + " = « " + valeurs[ch.id] + " »");
        ligne[ch.id] = v;
      }
      if (invalides.length) erreurs.push(ex + " : valeur non numérique (" + invalides.join(", ") + ").");
      else lignes.push(ligne);
    }
    return { lignes, erreurs };
  }

  function interpreter(grille, code, voulus) {
    const g = (grille || []).map((r) => (r || []).map((c) => String(c == null ? "" : c).trim()));
    const vide = { lignes: [], erreurs: [], disposition: null, correspondances: {}, ambiguites: [] };
    if (!g.length) return vide;
    const nbCol = Math.max(...g.map((r) => r.length));

    const ligneMultiEx = g.findIndex((r) => r.filter((c) => exercice(c)).length >= 2);
    const lignesEx = g.map((r, i) => ({ i, j: r.findIndex((c) => exercice(c)) }))
      .filter(({ i, j }) => j >= 0 && g[i].filter((c, k) => k !== j && estNombreRenseigne(c)).length >= 2);

    // Disposition 1 : un exercice par ligne, un type d'accueil par colonne.
    if (ligneMultiEx < 0 && lignesEx.length) {
      const premiere = lignesEx[0].i;
      const entetes = g.slice(0, premiere).filter((r) => {
        const pleine = r.length === nbCol && r.every((c) => c);
        return !(pleine && new Set(r).size === 1); // titre sur toute la largeur : ignoré
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
      const manquants = CHAMPS.filter((ch) => !(ch.id in index)).map((ch) => ch.libelle);
      const donnees = lignesEx.map(({ i, j }) => {
        const valeurs = {};
        for (const ch of CHAMPS) if (ch.id in index) valeurs[ch.id] = g[i][index[ch.id]];
        return { ex: exercice(g[i][j]), valeurs };
      });
      return { disposition: "un exercice par ligne", correspondances, ambiguites,
        ...construire(donnees, code, voulus, manquants) };
    }

    // Disposition 2 : un exercice par colonne, un type d'accueil par ligne.
    let h = ligneMultiEx;
    if (h < 0) {
      h = g.findIndex((r) => r.some((c) => exercice(c))
        && r.filter((c) => !exercice(c) && estNombreRenseigne(c)).length < 2);
    }
    if (h >= 0) {
      const colonnesEx = g[h].map((c, k) => ({ ex: exercice(c), k })).filter((x) => x.ex);
      const debut = Math.min(...colonnesEx.map((x) => x.k));
      const libelles = g.map((r, i) => {
        if (i <= h) return "";
        const parts = [];
        for (const v of r.slice(0, debut)) if (v && !parts.includes(v)) parts.push(v);
        return normLab(parts.join(" "));
      });
      const { index, correspondances, ambiguites } = associer(libelles);
      const manquants = CHAMPS.filter((ch) => !(ch.id in index)).map((ch) => ch.libelle);
      const donnees = colonnesEx.map(({ ex, k }) => {
        const valeurs = {};
        for (const ch of CHAMPS) if (ch.id in index) valeurs[ch.id] = g[index[ch.id]][k];
        return { ex, valeurs };
      });
      return { disposition: "un exercice par colonne", correspondances, ambiguites,
        ...construire(donnees, code, voulus, manquants) };
    }

    return vide;
  }

  // CSV (séparateur virgule, guillemets doubles) → lignes de textes.
  function lireCsv(texte) {
    const lignes = [];
    let ligne = [];
    let champ = "";
    let guillemets = false;
    const t = String(texte || "");
    for (let i = 0; i < t.length; i += 1) {
      const c = t[i];
      if (guillemets) {
        if (c === '"' && t[i + 1] === '"') { champ += '"'; i += 1; }
        else if (c === '"') guillemets = false;
        else champ += c;
      } else if (c === '"') guillemets = true;
      else if (c === ",") { ligne.push(champ); champ = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && t[i + 1] === "\n") i += 1;
        ligne.push(champ); lignes.push(ligne); ligne = []; champ = "";
      } else champ += c;
    }
    if (champ !== "" || ligne.length) { ligne.push(champ); lignes.push(ligne); }
    return lignes.filter((r) => r.some((c) => c.trim() !== ""));
  }

  // Essaie chaque tableau du rapport, puis l'export CSV ; garde la lecture la plus complète.
  function lireRapport(resultat, code, voulus) {
    const candidats = [...((resultat && resultat.grilles) || [])];
    if (resultat && resultat.csv) candidats.push(lireCsv(resultat.csv));
    let meilleur = null;
    for (const grille of candidats) {
      const it = interpreter(grille, code, voulus);
      if (it.lignes.length && (!meilleur || it.lignes.length > meilleur.lignes.length)) meilleur = it;
      if (!meilleur && it.erreurs.length) meilleur = it;
    }
    return meilleur || {
      lignes: [], disposition: null, correspondances: {}, ambiguites: [],
      erreurs: ["Format du rapport non reconnu. Utilisez « Copier le diagnostic » et transmettez-le."]
    };
  }

  const api = { CHAMPS, interpreter, lireCsv, lireRapport, exercice, nombre, normLab };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else racine.ICE = api;
})(typeof window !== "undefined" ? window : globalThis);
