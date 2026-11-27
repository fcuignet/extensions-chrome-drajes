// gristmap.js — transforme les données de l'application BAFA-BAFD en lignes
// des tables Grist du classeur « Formation - Gestion des OF ».
// Les formats reprennent exactement ceux du chargement initial (libellés,
// nettoyage des textes, dates en secondes UTC) pour que les mises à jour
// retrouvent les lignes existantes au lieu d'en créer de nouvelles.
(() => {
  'use strict';

  const ETATS = {
    DECLARATION_EN_COURS_DE_SAISIE: 'Déclaration en cours de saisie', DECLARATION_DEPOSEE: 'Déclaration déposée',
    DECLARATION_INCOMPLETE: 'Déclaration incomplète', DECLARATION_COMPLETE: 'Déclaration complète',
    DEMANDE_MODIFICATION_APRES_VALIDATION: 'Demande de modification après validation', RECEVABLE: 'Recevable',
    PV_DE_SAISIE_EN_ATTENTE_DE_DEPOT: 'PV de saisie en attente de dépôt', PV_A_COMPLETER: 'PV à compléter',
    PV_DEPOSE: 'PV déposé', DEMANDE_REFUSEE: 'Demande refusée', IRRECEVABLE: 'Irrecevable', DECLARATION_ANNULEE: 'Déclaration annulée'
  };
  const DOC = { JUSTIFICATIF: 'Justificatif', DIPLOME_TITRE: 'Diplôme ou titre', JUSTIFICATIF_EXPERIENCE: "Justificatif d'expérience", AUTRE: 'Autre', PROJET_PEDAGOGIQUE: 'Projet pédagogique' };
  const ETATDOC = { VALIDE: 'validé', A_VALIDER: 'à valider' };
  const INSC = { INSCRIT: 'Inscrit', EN_FORMATION: 'En formation', FAVORABLE_PASSAGE_JURY: 'Favorable passage jury', PASSAGE_FORCE_JURY: 'Passage forcé jury', JURY_EN_ATTENTE_PIECE_IDENTITE: "Jury : en attente de pièce d'identité", DIPLOME: 'Diplômé', REFUSE: 'Refusé', PARCOURS_DESACTIVE: 'Parcours désactivé' };
  const AVIS = { FAVORABLE: 'Favorable', DEFAVORABLE: 'Défavorable' };

  const human = (c) => c ? (c.charAt(0) + c.slice(1).toLowerCase()).replace(/_/g, ' ') : '';
  // Nettoyage des textes de la liste des sessions
  const t1 = (v) => v == null ? '' : String(v).replace(/[\t\r\n]+/g, ' ').trim();
  // Nettoyage des textes du détail (sauts de ligne remplacés par « / »)
  const t2 = (v) => v == null ? '' : String(v).replace(/\r\n|\r|\n/g, ' / ').replace(/\t/g, ' ').trim();
  const b = (v) => v === true ? true : v === false ? false : null;
  const d10 = (s) => s ? String(s).slice(0, 10) : '';
  // Date « AAAA-MM-JJ… » ou « JJ/MM/AAAA… » → secondes UTC (format des colonnes Date de Grist)
  function sec(s) {
    if (!s) return null;
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (!m) { const f = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s); if (f) m = [null, f[3], f[2], f[1]]; }
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 1000 : null;
  }
  const aujourdhui = () => { const n = new Date(); return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / 1000; };

  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const deacc = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  // Remplace le prénom et le nom du candidat par [prénom] et [nom] dans l'appréciation.
  function masquer(text, c) {
    if (!text) return text;
    const toks = [];
    const add = (s, rep) => { if (!s) return; const full = s.trim(); for (const p of [full, ...full.split(/[\s\-']+/)]) if (p && p.length >= 2) { toks.push([p, rep]); const da = deacc(p); if (da !== p) toks.push([da, rep]); } };
    add(c.prenom, '[prénom]'); add(c.nomFamille, '[nom]'); add(c.nomUsage, '[nom]');
    toks.sort((x, y) => y[0].length - x[0].length);
    let out = text;
    for (const [tk, rep] of toks) out = out.replace(new RegExp('(?<![\\p{L}\\p{N}])' + esc(tk) + '(?![\\p{L}\\p{N}])', 'giu'), rep);
    return out;
  }

  // Ligne de la table Sessions_BAFA_BAFD (clé : Id_BAFA), à partir de la liste des sessions
  function session(r) {
    const tl = 'typeSession' + 'Libelle';
    return {
      Id_BAFA: r.id, Numero_declaration: t1(r.numeroDeclaration), Diplome: (r.diplomeLibelle || '').toUpperCase(),
      Type_session: t1(r[tl]), Theme: t1(r.theme), Date_debut: sec(r.dateDebut), Date_fin: sec(r.dateFin),
      Etat: ETATS[r.etat] || r.etat || '', Date_changement_etat: sec(r.dateChangementEtat), Hors_delai: b(r.horsDelai),
      Date_depot: sec(r.dateDepotDeclaration), Date_validation: sec(r.dateValidationDeclaration),
      Commune_session: t1(r.communeLibelle), OF_Id_BAFA: r.orfId ?? null, OF_Sigle: t1(r.orfSigle), OF_Nom: t1(r.orfNom),
      OF_Code_postal: t1(r.orfCodePostal), OF_Commune: t1(r.orfCommunelibelle), Email_directeur: t1(r.emailDirecteur)
    };
  }

  // Lignes des 5 tables de détail pour une session (détail + liste des candidats)
  function detail(id, d, cands) {
    const L = d.lieu || {}, C = L.commune || {}, D = C.departement || {}, O = d.organismeFormation || {};
    const docs = (d.documentList || []).map(x => `${DOC[x.docType] || x.docType} – ${d10(x.fichier?.instantDepot)} – ${x.fichier?.nom || ''}`);
    const out = { details: [], equipes: [], grilles: [], observations: [], candidats: [] };
    out.details.push({
      Id_session: id, Lieu_nom: t2(L.nom), Lieu_adresse: t2(L.adresse), Lieu_telephone: t2(L.telephone), Lieu_commune: t2(C.libelle),
      Lieu_code_postal: t2(C.codePostal), Lieu_code_INSEE: t2(C.codeInsee), Lieu_dept_code: t2(D.code), Lieu_departement: t2(D.libelle),
      Lieu_region: t2(D.region?.libelle), Lieu_pays: t2(L.pays?.libelle), Telephone_directeur: t2(d.telephoneDirecteur),
      Mode_session: t2(d.grille?.modeSession?.libelle), Deroulement: t2(d.grille?.deroulement?.libelle), Grille_modele: b(d.grille?.isModel),
      Projet_pedagogique: (d.documentList || []).some(x => x.docType === 'PROJET_PEDAGOGIQUE'), Documents_session: t2(docs.join(' ; ')),
      OF_habilitation_BAFA: b(O.habilitationBafa), OF_fin_habilitation_BAFA: sec(O.dateExpirationBafa),
      OF_habilitation_BAFD: b(O.habilitationBafd), OF_fin_habilitation_BAFD: sec(O.dateExpirationBafd), OF_national: b(O.national),
      OF_delegation_nationale: t2(O.delegationNational?.nom),
      OF_suspensions: (O.suspensionHabilitationBafaList || []).length + (O.suspensionHabilitationBafdList || []).length,
      OF_SIRET: t2(O.siret), OF_responsable: t2([O.responsablePrenom, O.responsableNom].filter(Boolean).join(' ')),
      OF_responsable_mail: t2(O.responsableMail), Extrait_le: aujourdhui()
    });
    for (const m of d.membresSession || []) {
      const q = m.qualification || {}, ds = m.documentList || [];
      const just = ds.map(x => `${DOC[x.docType] || x.docType} – ${ETATDOC[x.etat] || x.etat || 'sans état'} – ${d10(x.fichier?.instantDepot)} – ${x.fichier?.nom || ''}`);
      out.equipes.push({
        Id_session: id, Id_membre: String(m.memId), Nom: t2(m.nomFamille), Nom_usage: t2(m.nomUsage), Prenom: t2(m.prenom),
        Date_naissance: sec(m.dateNaissance), Fonction: t2(m.fonction?.libelle), Directeur: b(m.directeur), Qualification: t2(q.libelle),
        Qualif_statut: b(q.statut), Qualif_direction: b(q.directeur), Qualif_formateur_BAFA: b(q.formateurBafa), Qualif_formateur_BAFD: b(q.formateurBafd),
        Autre_diplome: t2(m.autreDiplome), Numero_diplome: t2(m.numeroDiplome), Date_obtention: sec(m.dateObtention),
        Derogation: m.derogation == null ? '' : String(m.derogation), OF_membre: t2(m.organismeFormation?.nom), Archive: b(m.archive),
        Nb_justificatifs: ds.length, Nb_justificatifs_a_valider: ds.filter(x => x.etat === 'A_VALIDER').length, Justificatifs: t2(just.join(' ; '))
      });
    }
    for (const p of d.grille?.periodeList || []) {
      out.grilles.push({
        Id_session: id, Date_jour: sec(p.dateJour), Matin_debut: t2(p.heureDebutMatin), Matin_fin: t2(p.heureFinMatin),
        Apres_midi_debut: t2(p.heureDebutApresMidi), Apres_midi_fin: t2(p.heureFinApresMidi), Soiree_debut: t2(p.heureDebutSoiree), Soiree_fin: t2(p.heureFinSoiree)
      });
    }
    for (const o of d.sessionCommentaires || []) {
      out.observations.push({ Id_session: id, Date: sec(o.dateObservationService), Service: t2(o.libelleService), Observation: t2(o.observationService) });
    }
    for (const c of cands || []) {
      const r = c.rapportCirconstancie || {};
      out.candidats.push({
        Id_cursus_session: c.crcId, Id_session: id, Id_candidat: c.candidatId ?? null, Id_cursus: c.crsId ?? null,
        Numero_inscription: t2(c.numeroInscription), Etat_inscription: INSC[c.etatInscription] || human(c.etatInscription),
        Mois_naissance: (c.dateNaissance || '').slice(0, 7), Avis_OF: AVIS[c.avisOrganismeSession] || human(c.avisOrganismeSession),
        Appreciation_OF: t2(masquer(c.appreciationOrganismeSession, c)),
        Rapport_type: r.docType ? (DOC[r.docType] || human(r.docType)) : '', Rapport_date_depot: sec(r.fichier?.instantDepot)
      });
    }
    return out;
  }

  // Tables, clés de rapprochement et lignes de chaque lot
  const CLES = {
    Sessions_Details: ['Id_session'],
    Sessions_Equipes: ['Id_session', 'Id_membre'],
    Sessions_Grilles: ['Id_session', 'Date_jour'],
    Sessions_Observations: ['Id_session', 'Date', 'Service', 'Observation'],
    Sessions_Candidats: ['Id_cursus_session']
  };
  const TABLE_DE = { details: 'Sessions_Details', equipes: 'Sessions_Equipes', grilles: 'Sessions_Grilles', observations: 'Sessions_Observations', candidats: 'Sessions_Candidats' };

  globalThis.BafGrist = { session, detail, masquer, sec, CLES, TABLE_DE };
})();
