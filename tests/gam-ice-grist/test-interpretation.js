// Tests de lecture du rapport Stats ICE, au format réellement renvoyé par GAM (27/11/2026).
const assert = require("assert");
const ICE = require(process.argv[2]);

const ENTETE = ["Exercices", "Régions", "Départements", "accueil avec hébergement", "accueil de scoutisme",
  "accueil sans hébergement - Accueil de jeunes", "accueil sans hébergement - Accueil de loisirs",
  "accueil sans hébergement - Accueil périscolaire", "Total Accueils"];
const L = (ex, dep, v) => [ex, "Grand-Est", dep, ...v];
const rapport = [
  ENTETE,
  L("2024/2025", "Ardennes", ["140", "13", "7", "118", "107", "385"]),
  L("2024/2025", "Bas-Rhin", ["388", "84", "", "339", "545", "1356"]),
  L("2024/2025", "Meurthe-et-Moselle", ["193", "43", "7", "285", "436", "964"]),
  L("2024/2025", "Total région", ["721", "140", "14", "742", "1088", "2705"]),
  L("2025/2026", "Haute-Marne", ["125", "11", "", "71", "70", "277"]),
  L("2025/2026", "Total région", ["125", "11", "0", "71", "70", "277"])
];

// 1. Lecture complète : une ligne par exercice et département, total régional contrôlé.
let r = ICE.interpreter(rapport, null, null);
assert.deepStrictEqual(r.erreurs, []);
assert.deepStrictEqual(r.avertissements, []);
assert.strictEqual(r.controles, 2);
assert.strictEqual(r.lignes.length, 4);
assert.deepStrictEqual(r.lignes[1], { Exercice: "2024/2025", Departement: "67", Avec_hebergement: 388, Scoutisme: 84, ASH_Jeunes: 0, ASH_Loisirs: 339, ASH_Periscolaire: 545 });
assert.strictEqual(r.lignes[3].Departement, "52");

// 2. Filtre sur les exercices demandés.
r = ICE.interpreter(rapport, null, ["2025/2026"]);
assert.deepStrictEqual(r.lignes.map((l) => l.Exercice + "|" + l.Departement), ["2025/2026|52"]);

// 3. Total régional incohérent : avertissement, lignes conservées.
const r3 = rapport.map((l) => l.slice());
r3[4][3] = "700";
r = ICE.interpreter(r3, null, ["2024/2025"]);
assert.strictEqual(r.lignes.length, 3);
assert.ok(r.avertissements[0].includes("total régional"));

// 4. Département inconnu : ligne ignorée avec erreur.
const r4 = rapport.map((l) => l.slice());
r4[1][2] = "Corrèze";
r = ICE.interpreter(r4, null, ["2024/2025"]);
assert.strictEqual(r.lignes.length, 2);
assert.ok(r.erreurs[0].includes("Corrèze"));

// 5. Valeur non numérique : ligne refusée.
const r5 = rapport.map((l) => l.slice());
r5[2][5] = "n.c.";
r = ICE.interpreter(r5, null, ["2024/2025"]);
assert.strictEqual(r.lignes.length, 2);
assert.ok(r.erreurs[0].includes("non numérique"));

// 6. Colonne manquante : aucune ligne, erreur explicite.
r = ICE.interpreter(rapport.map((l) => l.filter((_, k) => k !== 7)), null, null);
assert.strictEqual(r.lignes.length, 0);
assert.ok(r.erreurs[0].includes("périscolaire"));

// 7. lireRapport : rien de reconnaissable → message de diagnostic.
r = ICE.lireRapport({ grilles: [[["sans rapport", "x"], ["a", "b"]]] }, null, null);
assert.ok(r.erreurs[0].includes("diagnostic"));

// 8. Codes départementaux.
assert.strictEqual(ICE.codeDepartement("Meurthe-et-Moselle"), "54");
assert.strictEqual(ICE.codeDepartement("Haut-Rhin"), "68");
assert.strictEqual(ICE.codeDepartement("Total région"), null);

console.log("8 tests réussis");
