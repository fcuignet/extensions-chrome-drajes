// Vérifie, dans gam-page.js, la reconstitution des cellules fusionnées (rowspan/colspan)
// et l'assemblage des pages du rapport.
const fs = require("fs"); const assert = require("assert");
const src = fs.readFileSync(process.argv[2], "utf8");
const extraire = (debut, fin) => {
  const a = src.indexOf(debut), b = src.indexOf(fin);
  assert.ok(a >= 0 && b > a, "fonction introuvable : " + debut);
  return eval("(" + src.slice(a, b).trim() + ")");
};
const norm = (s) => (s || "").replace(/[\s  ]+/g, " ").trim();
const matrice = extraire("  function matrice(table)", "  // Tableaux « feuilles »");
const assembler = extraire("  function assembler(pages)", "  // Fin des fonctions utilitaires.");

// 1. Cellules fusionnées.
const c = (t, rs = 1, cs = 1) => ({ innerText: t, rowSpan: rs, colSpan: cs });
const table = { rows: [
  { cells: [c("Exercice", 2), c("Avec héb.", 2), c("Sans hébergement", 1, 2)] },
  { cells: [c("Jeunes"), c("Loisirs")] },
  { cells: [c("2025/2026"), c("90"), c("3"), c("200")] }
] };
assert.deepStrictEqual(matrice(table), [
  ["Exercice", "Avec héb.", "Sans hébergement", "Sans hébergement"],
  ["Exercice", "Avec héb.", "Jeunes", "Loisirs"],
  ["2025/2026", "90", "3", "200"]
]);

// 2. Pages : en-tête sur la page 1 seulement, colonne d'espacement vide en tête,
//    et une colonne entièrement vide sur la page 3 (accueil de jeunes) qui doit rester alignée.
const p1 = [[
  ["", "Exercices", "Départements", "Avec héb.", "Jeunes", "Périscolaire"],
  ["", "2024/2025", "Ardennes", "140", "7", "107"]
]];
const p2 = [[["", "2024/2025", "Aube", "200", "1", "90"]]];
const p3 = [
  [["Titre seul"]],
  [["", "2027/2028", "Moselle", "", "", "1"], ["", "2027/2028", "Total région", "", "", "1"]]
];
const r = assembler([p1, p2, p3]);
assert.strictEqual(r.nonAlignes, 1); // le tableau « Titre seul » n'a pas d'équivalent en page 1
assert.deepStrictEqual(r.grilles[0], [
  ["Exercices", "Départements", "Avec héb.", "Jeunes", "Périscolaire"],
  ["2024/2025", "Ardennes", "140", "7", "107"],
  ["2024/2025", "Aube", "200", "1", "90"],
  ["2027/2028", "Moselle", "", "", "1"],
  ["2027/2028", "Total région", "", "", "1"]
]);
assert.strictEqual(r.grilles.length, 1); // un tableau d'une seule ligne n'est pas une grille

// 3. Rapport d'une seule page : inchangé.
assert.deepStrictEqual(assembler([p1]).grilles[0], [
  ["Exercices", "Départements", "Avec héb.", "Jeunes", "Périscolaire"],
  ["2024/2025", "Ardennes", "140", "7", "107"]
]);
console.log("matrice et assemblage des pages : 3 tests réussis");
