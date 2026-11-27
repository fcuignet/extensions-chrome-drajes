/*
 * Fonction exécutée DANS l'onglet GAM (monde « MAIN »), avec la session de l'utilisateur.
 * Chrome la sérialise avant de l'injecter : elle doit rester autonome
 * (aucune variable ni fonction extérieure). Elle renvoie toujours un objet ;
 * en cas d'échec, l'objet contient une propriété « erreur ».
 *
 * Commandes :
 *   "etat"                → connexion à GAM et département affiché
 *   "statsIce", {exercices: [...] | "tous"}
 *                         → édition « Stats ICE » (StatsIceDepartemental) : une ligne par
 *                           exercice et par département de la région, plus le total régional ;
 *                           toutes les pages du rapport sont lues et recollées
 */
async function gamCommand(cmd, arg) {
  const DEPS = [
    "Ardennes", "Aube", "Marne", "Haute-Marne", "Meurthe-et-Moselle",
    "Meuse", "Moselle", "Bas-Rhin", "Haut-Rhin", "Vosges"
  ];
  const EX = /^\d{4}\/\d{4}$/;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || "").replace(/[\s  ]+/g, " ").trim();

  function selectDepartements() {
    return [...document.querySelectorAll("select")]
      .find((s) => [...s.options].some((o) => DEPS.includes(norm(o.text))));
  }

  // Tableau HTML → matrice de textes, cellules fusionnées (rowspan/colspan) recopiées.
  function matrice(table) {
    const m = [];
    [...table.rows].forEach((ligne, li) => {
      m[li] = m[li] || [];
      let ci = 0;
      for (const cellule of ligne.cells) {
        while (m[li][ci] !== undefined) ci += 1;
        const texte = norm(cellule.innerText);
        const rs = Math.max(1, cellule.rowSpan || 1);
        const cs = Math.max(1, cellule.colSpan || 1);
        for (let a = 0; a < rs; a += 1) {
          for (let b = 0; b < cs; b += 1) {
            m[li + a] = m[li + a] || [];
            m[li + a][ci + b] = texte;
          }
        }
        ci += cs;
      }
    });
    return m.map((r) => Array.from(r || [], (x) => (x === undefined ? "" : x)));
  }

  // Tableaux « feuilles » d'une page du rapport : matrices brutes, sans lignes vides.
  function tableauxPage(racine) {
    return [...racine.querySelectorAll("table")]
      .filter((t) => !t.querySelector("table"))
      .map((t) => matrice(t).filter((r) => r.some((c) => c)))
      .filter((m) => m.length);
  }

  // Recolle les pages du rapport (seule la page 1 porte les en-têtes de colonnes) :
  // un tableau d'une page suivante prolonge le plus long tableau de même largeur déjà lu.
  // Les colonnes vides sont retirées après assemblage, pour que toutes les pages restent alignées.
  function assembler(pages) {
    const largeur = (m) => Math.max(0, ...m.map((r) => r.length));
    const res = (pages[0] || []).map((m) => m.slice());
    let nonAlignes = 0;
    for (const page of pages.slice(1)) {
      for (const m of page) {
        const cible = res.filter((x) => largeur(x) === largeur(m))
          .sort((a, b) => b.length - a.length)[0];
        if (cible) cible.push(...m);
        else { res.push(m.slice()); nonAlignes += 1; }
      }
    }
    const grilles = [];
    for (const m of res) {
      if (m.length < 2) continue;
      const nb = largeur(m);
      const garder = [];
      for (let c = 0; c < nb; c += 1) if (m.some((r) => r[c])) garder.push(c);
      grilles.push(m.map((r) => garder.map((c) => r[c] || "")));
    }
    return { grilles, nonAlignes };
  }

  // Fin des fonctions utilitaires.

  try {
    if (cmd === "etat") {
      const s = selectDepartements();
      if (!s) return { connecte: false };
      const o = s.options[s.selectedIndex];
      return { connecte: true, courant: o ? norm(o.text) : "" };
    }

    if (cmd === "statsIce") {
      const racine = document.querySelector("[ng-app],[data-ng-app]") || document.body;
      const inj = window.angular ? window.angular.element(racine).injector() : null;
      if (!inj) throw new Error("GAM n'est pas chargé dans cet onglet.");
      const $http = inj.get("$http");
      const REST = inj.get("SERVER_REST");

      // GAM prépare la session des éditions à l'ouverture de la page « Éditions » :
      // sans cet appel, le rapport répond « valeur manquante dans le paramètre departementId ».
      await $http({ method: "GET", url: REST.url + "/edition/getEditionTitle" });

      const f = document.createElement("iframe");
      f.style.cssText = "position:fixed;left:-10000px;top:0;width:1400px;height:900px;border:0;";
      f.src = REST.url + "/RSEditions/Editions.aspx?RptType=7&RptName=StatsIceDepartemental&_=" + Date.now();
      const charge = new Promise((ok, ko) => {
        f.addEventListener("load", ok, { once: true });
        setTimeout(() => ko(new Error("Le rapport Stats ICE ne se charge pas.")), 30000);
      });
      document.body.appendChild(f);
      try {
        await charge;
        await wait(500);
        const d = f.contentDocument;
        const w = f.contentWindow;

        // Liste des exercices : elle n'est construite qu'à l'ouverture de la liste déroulante.
        const champ = d.querySelector('input[id$="_txtValue"]');
        if (!champ) throw new Error("Paramètre « Exercices » introuvable (session GAM expirée ?).");
        champ.click();
        await wait(800);
        const cases = [...d.querySelectorAll('[id$="_divDropDown"] input[type=checkbox]')].map((b) => {
          const l = d.querySelector('label[for="' + b.id + '"]');
          return { b, lab: norm(l ? l.textContent : "") };
        });
        const dispo = cases.map((x) => x.lab).filter((l) => EX.test(l));
        if (!dispo.length) throw new Error("Aucun exercice proposé par le rapport.");
        const demandes = arg && arg.exercices === "tous" ? dispo
          : dispo.filter((l) => ((arg && arg.exercices) || []).includes(l));
        if (!demandes.length) {
          return { exercicesDisponibles: dispo, exercicesDemandes: [], grilles: [], texte: "" };
        }
        for (const { b, lab } of cases) {
          if (!EX.test(lab)) continue;
          if (b.checked !== demandes.includes(lab)) b.click();
        }
        // Fermer la liste valide le choix (indices cachés + texte du champ).
        try {
          w.$get(champ.id.replace(/_txtValue$/, "")).control.HideFloatingFrame();
        } catch (e) {
          throw new Error("Impossible de valider le choix des exercices dans le rapport.");
        }
        if (!champ.value) throw new Error("Le choix des exercices n'a pas été pris en compte.");

        const bouton = [...d.querySelectorAll("input[type=submit],input[type=button]")]
          .find((x) => /afficher le rapport/i.test(x.value));
        if (!bouton) throw new Error("Bouton « Afficher le rapport » introuvable.");
        const idRv = bouton.id.split("_")[0];
        bouton.click();
        await wait(1500);

        let contenu = null;
        for (let i = 0; i < 240 && !contenu; i += 1) {
          await wait(500);
          const fw = f.contentWindow;
          const dd = f.contentDocument;
          if (!fw || !dd || !dd.body) continue;
          let rv = null;
          try { rv = fw.$find ? fw.$find(idRv) : null; } catch (e) { rv = null; }
          let enCours = false;
          try { enCours = !!(rv && rv.get_isLoading && rv.get_isLoading()); } catch (e) { enCours = false; }
          const vis = dd.querySelector('[id^="VisibleReportContent"]') || dd.querySelector('div[id$="_oReportDiv"]');
          const txt = vis ? norm(vis.innerText) : "";
          if (!vis) {
            const message = norm(dd.body.innerText);
            if (/valeur est manquante|erreur/i.test(message)) throw new Error("GAM : " + message.slice(0, 200));
          }
          if (!enCours && txt && (demandes.some((l) => txt.includes(l)) || i > 60)) contenu = vis;
        }
        if (!contenu) throw new Error("Le rapport ne s'est pas affiché (délai dépassé).");

        // Le rapport est découpé en pages (environ 48 lignes chacune) : on les lit toutes
        // avec le bouton « Page suivante » de la barre d'outils du rapport.
        const pages = [tableauxPage(contenu)];
        const textes = [norm(contenu.innerText)];
        const outil = (suffixe) => f.contentDocument.querySelector('[id^="' + idRv + '_"][id$="' + suffixe + '"]');
        const affiche = (el) => !!el && f.contentWindow.getComputedStyle(el).display !== "none";
        const numero = () => { const c = outil("_CurrentPage"); return c ? c.value : ""; };
        for (let p = 2; p <= 50; p += 1) {
          const suivant = outil("_Next_ctl00"); // bouton actif ; sa version grisée est « _Next_ctl01 »
          if (!affiche(suivant)) break;
          const avant = numero();
          suivant.click();
          let page = null;
          for (let i = 0; i < 200 && !page; i += 1) {
            await wait(300);
            let enCours = false;
            try { const rv = f.contentWindow.$find(idRv); enCours = !!(rv && rv.get_isLoading()); } catch (e) { enCours = false; }
            const vis = f.contentDocument.querySelector('[id^="VisibleReportContent"]') ||
              f.contentDocument.querySelector('div[id$="_oReportDiv"]');
            if (!enCours && numero() && numero() !== avant && vis && norm(vis.innerText)) page = vis;
          }
          if (!page) throw new Error("La page " + p + " du rapport ne s'est pas affichée (délai dépassé).");
          pages.push(tableauxPage(page));
          textes.push(norm(page.innerText));
        }
        if (affiche(outil("_Next_ctl00"))) throw new Error("Le rapport compte plus de 50 pages : choisissez moins d'exercices.");

        const { grilles, nonAlignes } = assembler(pages);
        return {
          exercicesDisponibles: dispo,
          exercicesDemandes: demandes,
          nbPages: pages.length,
          pagesNonAlignees: nonAlignes,
          grilles,
          texte: textes.join(" ").slice(0, 4000)
        };
      } finally {
        f.remove();
      }
    }

    throw new Error("Commande inconnue : " + cmd);
  } catch (e) {
    return { erreur: e && e.message ? e.message : String(e) };
  }
}
