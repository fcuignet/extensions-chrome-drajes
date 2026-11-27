/*
 * Fonction exécutée DANS l'onglet GAM (monde « MAIN »), avec la session de l'utilisateur.
 * Chrome la sérialise avant de l'injecter : elle doit rester autonome
 * (aucune variable ni fonction extérieure). Elle renvoie toujours un objet ;
 * en cas d'échec, l'objet contient une propriété « erreur ».
 *
 * Commandes :
 *   "etat"                          → connexion, département affiché, départements accessibles
 *   "choisirDepartement", libellé   → sélectionne le département dans GAM (comme à la main)
 *   "statsIce", {exercices}         → édition « Stats ICE » (StatsIceDepartemental) du département affiché
 */
async function gamCommand(cmd, arg) {
  const DEPS = {
    "Ardennes": "08", "Aube": "10", "Marne": "51", "Haute-Marne": "52",
    "Meurthe-et-Moselle": "54", "Meuse": "55", "Moselle": "57",
    "Bas-Rhin": "67", "Haut-Rhin": "68", "Vosges": "88"
  };
  const RAPPORT = "/api/RSEditions/Editions.aspx?RptType=7&RptName=StatsIceDepartemental";
  const EX = /^\d{4}\/\d{4}$/;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || "").replace(/[\s  ]+/g, " ").trim();

  function selectDepartements() {
    return [...document.querySelectorAll("select")]
      .find((s) => [...s.options].some((o) => DEPS[norm(o.text)]));
  }

  function libelleCourant(s) {
    const o = s.options[s.selectedIndex];
    return o ? norm(o.text) : "";
  }

  // Attend que GAM n'ait plus d'appel en cours (service $http d'AngularJS).
  async function attendreGam(delai) {
    let $http = null;
    try {
      const racine = document.querySelector("[ng-app],[data-ng-app]") || document.body;
      const inj = window.angular ? window.angular.element(racine).injector() : null;
      $http = inj ? inj.get("$http") : null;
    } catch (e) { $http = null; }
    const debut = Date.now();
    let calme = 0;
    await wait(400);
    while (Date.now() - debut < delai) {
      if (!$http || $http.pendingRequests.length === 0) {
        calme += 1;
        if (calme >= 4) return;
      } else {
        calme = 0;
      }
      await wait(250);
    }
    throw new Error("GAM ne répond pas (délai dépassé).");
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

  // Tous les tableaux « feuilles » du rapport, sans lignes ni colonnes vides.
  function grilles(racine) {
    const feuilles = [...racine.querySelectorAll("table")].filter((t) => !t.querySelector("table"));
    const res = [];
    for (const t of feuilles) {
      let m = matrice(t).filter((r) => r.some((c) => c));
      if (m.length < 2) continue;
      const nb = Math.max(...m.map((r) => r.length));
      const garder = [];
      for (let c = 0; c < nb; c += 1) if (m.some((r) => r[c])) garder.push(c);
      m = m.map((r) => garder.map((c) => r[c] || ""));
      res.push(m);
    }
    return res;
  }

  async function decoder(reponse) {
    const buf = await reponse.arrayBuffer();
    const u = new Uint8Array(buf);
    let enc = "utf-8";
    if (u[0] === 0xff && u[1] === 0xfe) enc = "utf-16le";
    else if (u[0] === 0xfe && u[1] === 0xff) enc = "utf-16be";
    return new TextDecoder(enc).decode(buf).replace(/^﻿/, "");
  }

  try {
    if (cmd === "etat") {
      const s = selectDepartements();
      if (!s) return { connecte: false };
      return {
        connecte: true,
        courant: libelleCourant(s),
        departements: [...s.options].map((o) => norm(o.text)).filter((t) => DEPS[t])
          .map((t) => ({ libelle: t, code: DEPS[t] }))
      };
    }

    if (cmd === "choisirDepartement") {
      const s = selectDepartements();
      if (!s) throw new Error("Vous n'êtes pas connecté à GAM.");
      const option = [...s.options].find((o) => norm(o.text) === arg);
      if (!option) throw new Error("Département absent de GAM : " + arg);
      if (libelleCourant(s) !== arg) {
        s.value = option.value;
        s.dispatchEvent(new Event("change", { bubbles: true }));
      }
      await attendreGam(30000);
      const s2 = selectDepartements();
      const apres = s2 ? libelleCourant(s2) : "";
      if (apres !== arg) {
        throw new Error("Le changement de département a échoué (département affiché : " + (apres || "aucun") + ").");
      }
      return { courant: apres };
    }

    if (cmd === "statsIce") {
      const f = document.createElement("iframe");
      f.style.cssText = "position:fixed;left:-10000px;top:0;width:1400px;height:900px;border:0;";
      f.src = RAPPORT + "&_=" + Date.now();
      const charge = new Promise((ok, ko) => {
        f.addEventListener("load", ok, { once: true });
        setTimeout(() => ko(new Error("Le rapport Stats ICE ne se charge pas.")), 30000);
      });
      document.body.appendChild(f);
      try {
        await charge;
        const d = f.contentDocument;
        const cases = [...d.querySelectorAll('[id*="divDropDown"] input[type=checkbox]')].map((b) => {
          const l = d.querySelector('label[for="' + b.id + '"]');
          return { b, lab: norm(l ? l.textContent : "") };
        });
        if (!cases.length) {
          throw new Error("Paramètre « Exercices » introuvable dans le rapport (session GAM expirée ?).");
        }
        const dispo = cases.map((x) => x.lab).filter((l) => EX.test(l));
        const demandes = arg && arg.exercices === "tous" ? dispo
          : dispo.filter((l) => ((arg && arg.exercices) || []).includes(l));
        if (!demandes.length) {
          return { exercicesDisponibles: dispo, exercicesDemandes: [], grilles: [], csv: null, texte: "" };
        }
        for (const { b, lab } of cases) {
          if (!EX.test(lab)) continue;
          if (b.checked !== demandes.includes(lab)) b.click();
        }
        const bouton = [...d.querySelectorAll("input[type=submit],input[type=button]")]
          .find((x) => /afficher le rapport/i.test(x.value));
        if (!bouton) throw new Error("Bouton « Afficher le rapport » introuvable.");
        const idRv = bouton.id.split("_")[0];
        bouton.click();
        await wait(1000);

        let contenu = null;
        let base = null;
        for (let i = 0; i < 120 && !contenu; i += 1) {
          await wait(500);
          const w = f.contentWindow;
          const dd = f.contentDocument;
          if (!w || !dd) continue;
          let rv = null;
          try { rv = w.$find ? w.$find(idRv) : null; } catch (e) { rv = null; }
          let enCours = false;
          try { enCours = !!(rv && rv.get_isLoading && rv.get_isLoading()); } catch (e) { enCours = false; }
          const vis = dd.querySelector('[id^="VisibleReportContent"]') || dd.querySelector('div[id$="_oReportDiv"]');
          const txt = vis ? norm(vis.innerText) : "";
          if (!enCours && txt && (demandes.some((l) => txt.includes(l)) || i > 30)) {
            contenu = vis;
            try {
              const iv = rv && rv._getInternalViewer ? rv._getInternalViewer() : null;
              base = iv ? iv.ExportUrlBase : null;
            } catch (e) { base = null; }
          }
        }
        if (!contenu) throw new Error("Le rapport ne s'est pas affiché (délai dépassé).");

        let csv = null;
        if (base) {
          try {
            const r = await fetch(base + "CSV", { credentials: "include" });
            if (r.ok) csv = await decoder(r);
          } catch (e) { csv = null; }
        }
        return {
          exercicesDisponibles: dispo,
          exercicesDemandes: demandes,
          grilles: grilles(contenu),
          csv,
          texte: norm(contenu.innerText).slice(0, 4000)
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
