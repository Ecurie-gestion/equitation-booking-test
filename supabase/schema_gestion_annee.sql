-- =========================================================
-- Écurie de Groynne — Gestion des cours à l'année
-- Nouvelles tables à ajouter dans le projet Supabase de TEST
-- À exécuter dans : Supabase > (projet TEST) > SQL Editor > New query
-- =========================================================

-- 1. Cavaliers (élèves inscrits à l'année)
create table if not exists cavaliers (
  id uuid primary key default gen_random_uuid(),
  prenom text not null,
  nom text not null,
  parent_nom text,
  email text,
  telephone text,
  niveau text,              -- ex: "Prépa Degré 1" (repère indicatif, un créneau peut mélanger les niveaux)
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2. Chevaux
create table if not exists chevaux (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  description text,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

-- 3. Créneaux fixes (le cours qui revient chaque semaine, toute l'année scolaire)
create table if not exists creneaux_fixes (
  id uuid primary key default gen_random_uuid(),
  jour_semaine int not null check (jour_semaine between 0 and 6), -- 0 = dimanche ... 6 = samedi
  heure_debut time not null,
  heure_fin time not null,
  niveaux text,              -- ex: "Prépa Bronze/Argent + Degré 1" (niveaux mélangés possibles)
  moniteur text,             -- nom du moniteur en charge (deviendra un vrai compte à la Phase 6)
  capacite_max int not null default 8,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

-- 4. Abonnements (comment un cavalier est rattaché à un créneau fixe)
create table if not exists abonnements (
  id uuid primary key default gen_random_uuid(),
  cavalier_id uuid not null references cavaliers(id) on delete cascade,
  creneau_fixe_id uuid not null references creneaux_fixes(id) on delete cascade,
  type text not null check (type in ('unite', 'dix_lecons', 'vacances_a_vacances')),
  date_debut date not null,
  date_fin date,                  -- rempli pour 'vacances_a_vacances' (date des prochaines vacances) ; vide sinon
  lecons_totales int,              -- ex: 10 pour l'abonnement "dix_lecons"
  lecons_restantes int,            -- décrémenté à chaque présence comptabilisée (pas les absences reportées)
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

-- 5. Séances (occurrence concrète d'un créneau fixe, à une date donnée)
create table if not exists seances (
  id uuid primary key default gen_random_uuid(),
  creneau_fixe_id uuid not null references creneaux_fixes(id) on delete cascade,
  date date not null,
  annulee boolean not null default false,
  created_at timestamptz not null default now(),
  unique (creneau_fixe_id, date)
);

-- 6. Présences (qui était là, sur quel cheval, pour chaque séance)
create table if not exists presences (
  id uuid primary key default gen_random_uuid(),
  seance_id uuid not null references seances(id) on delete cascade,
  cavalier_id uuid not null references cavaliers(id) on delete cascade,
  cheval_id uuid references chevaux(id) on delete set null,
  present boolean,                -- null = pas encore pointé, true = présent, false = absent
  commentaire text,
  created_at timestamptz not null default now(),
  unique (seance_id, cavalier_id)
);

-- Index utiles pour les recherches fréquentes
create index if not exists idx_abonnements_cavalier on abonnements(cavalier_id);
create index if not exists idx_abonnements_creneau on abonnements(creneau_fixe_id);
create index if not exists idx_seances_creneau on seances(creneau_fixe_id);
create index if not exists idx_seances_date on seances(date);
create index if not exists idx_presences_seance on presences(seance_id);
create index if not exists idx_presences_cavalier on presences(cavalier_id);

-- Remarque sécurité (Phase 6, pas encore fait ici) :
-- Ces tables n'ont pas encore de règles RLS (Row Level Security) ni de lien
-- avec de vrais comptes moniteurs. Comme pour les tables existantes (slots,
-- bookings, events), l'accès passe pour l'instant par la clé publique
-- (anon key) sans vraie restriction côté base. À corriger à la Phase 6.
