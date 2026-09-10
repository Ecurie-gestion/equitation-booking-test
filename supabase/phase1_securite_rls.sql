-- =========================================================
-- Écurie de Groynne — Phase 1 : Sécurité de la base (RLS)
-- À exécuter dans : Supabase (projet TEST) > SQL Editor > New query
-- =========================================================
--
-- CE QUE FAIT CE SCRIPT :
-- Aujourd'hui, aucune table n'a de règle de sécurité (RLS). Concrètement,
-- n'importe qui connaissant la clé publique du site (visible dans le code
-- de la page, donc accessible à tout le monde) peut actuellement LIRE,
-- MODIFIER ou SUPPRIMER n'importe quelle ligne de n'importe quelle table,
-- directement via l'API, sans passer par le site.
--
-- Ce script active la protection (RLS) sur chaque table et redonne
-- exactement les droits nécessaires :
--   - "public" (visiteurs non connectés, cavaliers/parents) : uniquement
--     ce dont le site a besoin aujourd'hui pour fonctionner (lecture des
--     créneaux/cours/chevaux, et création de réservations/inscriptions).
--   - "moniteur connecté" (espace admin) : accès complet, comme aujourd'hui.
--   - Personne (à part le site lui-même via ses fonctions techniques) ne
--     peut plus modifier ou supprimer les données depuis l'extérieur.
--
-- CE QUE CE SCRIPT NE FAIT PAS (Phase 2, à faire séparément plus tard) :
-- Certaines pages publiques (ex: "Mes réservations", le tableau du jour)
-- font aujourd'hui des lectures assez larges sur des tables contenant des
-- coordonnées (email, téléphone) pour fonctionner. Ce script conserve ce
-- comportement tel quel (donc rien ne casse), mais ne le durcit pas
-- davantage — cela demande de modifier un peu le site lui-même, pas
-- seulement la base. On s'en occupera dans un second temps si tu veux.
--
-- Ce script est sans danger pour les données existantes : il ne modifie et
-- ne supprime AUCUNE ligne, il ajoute seulement des règles d'accès.
-- =========================================================


-- ---------------------------------------------------------
-- 1. Activer la protection (RLS) sur toutes les tables
-- ---------------------------------------------------------
alter table chevaux              enable row level security;
alter table soins_chevaux        enable row level security;
alter table creneaux_fixes       enable row level security;
alter table seances              enable row level security;
alter table presences            enable row level security;
alter table cavaliers            enable row level security;
alter table abonnements          enable row level security;
alter table slots                enable row level security;
alter table bookings             enable row level security;
alter table events               enable row level security;
alter table event_inscriptions   enable row level security;
alter table vacances_scolaires   enable row level security;
alter table google_tokens        enable row level security;


-- ---------------------------------------------------------
-- 2. Accès moniteur (connecté à l'espace admin) : accès complet
--    sur toutes les tables de gestion, comme aujourd'hui.
-- ---------------------------------------------------------
create policy "moniteur_tout_chevaux" on chevaux
  for all to authenticated using (true) with check (true);

create policy "moniteur_tout_soins_chevaux" on soins_chevaux
  for all to authenticated using (true) with check (true);

create policy "moniteur_tout_creneaux_fixes" on creneaux_fixes
  for all to authenticated using (true) with check (true);

create policy "moniteur_tout_seances" on seances
  for all to authenticated using (true) with check (true);

create policy "moniteur_tout_presences" on presences
  for all to authenticated using (true) with check (true);

create policy "moniteur_tout_cavaliers" on cavaliers
  for all to authenticated using (true) with check (true);

create policy "moniteur_tout_abonnements" on abonnements
  for all to authenticated using (true) with check (true);

create policy "moniteur_tout_slots" on slots
  for all to authenticated using (true) with check (true);

create policy "moniteur_tout_bookings" on bookings
  for all to authenticated using (true) with check (true);

create policy "moniteur_tout_events" on events
  for all to authenticated using (true) with check (true);

create policy "moniteur_tout_event_inscriptions" on event_inscriptions
  for all to authenticated using (true) with check (true);

create policy "moniteur_tout_vacances_scolaires" on vacances_scolaires
  for all to authenticated using (true) with check (true);

-- Remarque : aucune policy sur google_tokens, même pour "authenticated" —
-- cette table n'est utilisée que par les fonctions techniques du site
-- (qui utilisent une clé spéciale non concernée par ces règles), jamais
-- directement par le site ou l'espace moniteur. Elle reste donc
-- totalement inaccessible de l'extérieur, ce qui est voulu.


-- ---------------------------------------------------------
-- 3. Accès public (visiteurs non connectés) : uniquement ce que
--    le site public utilise déjà aujourd'hui.
-- ---------------------------------------------------------

-- Lecture publique (pages de réservation, calendrier, "Aujourd'hui/demain") :
create policy "public_lecture_chevaux" on chevaux
  for select to anon using (true);

create policy "public_lecture_creneaux_fixes" on creneaux_fixes
  for select to anon using (true);

create policy "public_lecture_seances" on seances
  for select to anon using (true);

create policy "public_lecture_slots" on slots
  for select to anon using (true);

create policy "public_lecture_events" on events
  for select to anon using (true);

create policy "public_lecture_vacances_scolaires" on vacances_scolaires
  for select to anon using (true);

-- Lecture ET création publiques (formulaires de réservation/inscription
-- + "Mes réservations" + tableau du jour) :
create policy "public_lecture_cavaliers" on cavaliers
  for select to anon using (true);
create policy "public_creation_cavaliers" on cavaliers
  for insert to anon with check (true);

create policy "public_lecture_abonnements" on abonnements
  for select to anon using (true);
create policy "public_creation_abonnements" on abonnements
  for insert to anon with check (true);

create policy "public_lecture_bookings" on bookings
  for select to anon using (true);
create policy "public_creation_bookings" on bookings
  for insert to anon with check (true);

create policy "public_lecture_event_inscriptions" on event_inscriptions
  for select to anon using (true);
create policy "public_creation_event_inscriptions" on event_inscriptions
  for insert to anon with check (true);

create policy "public_lecture_presences" on presences
  for select to anon using (true);

-- Remarque : aucune policy UPDATE ni DELETE pour "anon" sur aucune table.
-- Sans policy, Postgres refuse automatiquement l'action — un visiteur ne
-- peut donc plus jamais modifier ou supprimer une ligne existante,
-- uniquement en créer de nouvelles là où c'est prévu (réservations,
-- inscriptions). C'est le vrai changement de fond de cette Phase 1.

-- soins_chevaux : aucune policy "anon" du tout (ni lecture, ni écriture)
-- — cette table n'est utilisée que dans l'espace moniteur.
