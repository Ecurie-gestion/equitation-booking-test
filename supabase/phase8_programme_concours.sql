-- =========================================================
-- Écurie de Groynne — Phase 8 : chevaux et épreuves des concours
-- À exécuter dans : Supabase > SQL Editor > New query
-- =========================================================
--
-- CE QUE FAIT CE SCRIPT :
-- Permet au moniteur d'attribuer à chaque cavalier inscrit à un concours
-- une ou plusieurs épreuves (avec heure et cheval), et à chaque famille de
-- voir UNIQUEMENT les siennes.
--
--   1. Ajoute une colonne "programme_publie" sur la table des événements
--      (par défaut FAUX : rien n'est visible tant que tu n'as pas publié).
--   2. Crée une NOUVELLE table "concours_programme" qui contient les
--      attributions. Elle est FERMÉE au public : seul le moniteur
--      connecté peut la lire ou la modifier. Les familles ne peuvent pas
--      la lire directement, même en connaissant la clé publique du site.
--   3. Crée une fonction sécurisée "mon_programme_concours" : la famille
--      donne le prénom, le nom et l'email ou le téléphone de l'inscription ;
--      la base vérifie, puis ne renvoie que les lignes de CE cavalier, et
--      seulement pour les concours publiés.
--
-- SANS DANGER POUR L'EXISTANT : ce script n'efface, ne modifie et ne
-- désinscrit AUCUNE ligne existante (cavaliers, inscriptions, événements,
-- chevaux...). Il peut être relancé sans problème (rien n'est dupliqué).
-- =========================================================


-- ---------------------------------------------------------
-- 1. Interrupteur "programme publié" sur chaque événement
-- ---------------------------------------------------------
alter table events add column if not exists programme_publie boolean not null default false;


-- ---------------------------------------------------------
-- 2. Table des attributions (cavalier x épreuve x cheval)
--    Les types des colonnes de liaison sont lus sur vos tables
--    existantes, pour être sûr qu'ils correspondent.
-- ---------------------------------------------------------
do $$
declare
  t_event text;
  t_insc  text;
begin
  select format_type(a.atttypid, a.atttypmod) into t_event
    from pg_attribute a
   where a.attrelid = 'public.events'::regclass and a.attname = 'id';

  select format_type(a.atttypid, a.atttypmod) into t_insc
    from pg_attribute a
   where a.attrelid = 'public.event_inscriptions'::regclass and a.attname = 'id';

  execute format($f$
    create table if not exists public.concours_programme (
      id uuid primary key default gen_random_uuid(),
      event_id %s not null references public.events(id) on delete cascade,
      inscription_id %s not null references public.event_inscriptions(id) on delete cascade,
      epreuve text not null,
      heure time,
      cheval_id uuid references public.chevaux(id) on delete set null,
      cheval_libre text,
      ordre integer not null default 0,
      created_at timestamptz not null default now()
    )
  $f$, t_event, t_insc);
end $$;

create index if not exists concours_programme_event_idx on concours_programme (event_id);
create index if not exists concours_programme_insc_idx on concours_programme (inscription_id);

-- Protection : fermée à tout le monde, ouverte au moniteur connecté.
alter table concours_programme enable row level security;

drop policy if exists "moniteur_tout_concours_programme" on concours_programme;
create policy "moniteur_tout_concours_programme" on concours_programme
  for all to authenticated using (true) with check (true);

-- (Volontairement AUCUNE règle pour "anon" : les visiteurs ne peuvent
--  rien lire ni écrire dans cette table.)


-- ---------------------------------------------------------
-- 3. Fonctions de vérification + lecture sécurisée pour les familles
-- ---------------------------------------------------------

-- Normalise un nom : sans accents, minuscules, espaces simplifiés
-- (même logique que celle du site).
create or replace function edg_norm(t text)
returns text
language sql
immutable
as $$
  select lower(
    translate(
      regexp_replace(trim(coalesce(t, '')), '\s+', ' ', 'g'),
      'àâäáãåéèêëíìîïóòôöõúùûüýÿçñÀÂÄÁÃÅÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÝÇÑ',
      'aaaaaaeeeeiiiiooooouuuuyycnAAAAAAEEEEIIIIOOOOOUUUUYCN'
    )
  )
$$;

-- L'email ou le téléphone saisi correspond-il à celui enregistré ?
-- (téléphone : on compare les 9 derniers chiffres, comme sur le site)
create or replace function edg_contact_ok(saisie text, email_enreg text, tel_enreg text)
returns boolean
language plpgsql
immutable
as $$
declare
  s text := trim(coalesce(saisie, ''));
  digits_in text;
  digits_db text;
begin
  if s = '' then return false; end if;

  if email_enreg is not null and trim(email_enreg) <> ''
     and lower(s) = lower(trim(email_enreg)) then
    return true;
  end if;

  digits_in := regexp_replace(s, '\D', '', 'g');
  if length(digits_in) >= 9 and tel_enreg is not null then
    digits_db := regexp_replace(tel_enreg, '\D', '', 'g');
    if length(digits_db) >= 9 and right(digits_in, 9) = right(digits_db, 9) then
      return true;
    end if;
  end if;

  return false;
end
$$;

-- La fonction appelée par le site. Elle s'exécute avec les droits de la
-- base (security definer) MAIS ne renvoie que les lignes du cavalier dont
-- l'identité est vérifiée, et seulement pour les concours publiés.
create or replace function mon_programme_concours(p_prenom text, p_nom text, p_contact text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prenom text := edg_norm(p_prenom);
  v_nom    text := edg_norm(p_nom);
  v_ids    text[];
  v_result jsonb;
begin
  if v_prenom = '' or v_nom = '' or coalesce(trim(p_contact), '') = '' then
    return jsonb_build_object('ok', false);
  end if;

  -- Inscriptions de ce cavalier (même prénom + nom) dont l'email ou le
  -- téléphone (de l'inscription OU de la fiche élève) correspond.
  select array_agg(i.id::text) into v_ids
    from event_inscriptions i
    left join cavaliers c on c.id = i.cavalier_id
   where edg_norm(i.child_name) = v_prenom
     and edg_norm(i.child_nom) = v_nom
     and (
          edg_contact_ok(p_contact, i.email, i.phone)
       or edg_contact_ok(p_contact, c.email, c.telephone)
     );

  if v_ids is null then
    -- Petit délai : décourage les essais en rafale.
    perform pg_sleep(0.5);
    return jsonb_build_object('ok', false);
  end if;

  select coalesce(jsonb_agg(ev.obj order by ev.date_start), '[]'::jsonb) into v_result
    from (
      select e.date_start,
             jsonb_build_object(
               'event_id', e.id,
               'titre', e.title,
               'date_start', e.date_start,
               'date_end', e.date_end,
               'epreuves', (
                 select coalesce(jsonb_agg(
                          jsonb_build_object(
                            'epreuve', p.epreuve,
                            'heure', to_char(p.heure, 'HH24:MI'),
                            'cheval', coalesce(ch.nom, nullif(trim(p.cheval_libre), ''))
                          )
                          order by p.ordre, p.heure nulls last, p.created_at
                        ), '[]'::jsonb)
                   from concours_programme p
                   left join chevaux ch on ch.id = p.cheval_id
                  where p.event_id = e.id
                    and p.inscription_id::text = any (v_ids)
               )
             ) as obj
        from events e
       where e.programme_publie
         and e.date_end >= current_date - 14
         and exists (
               select 1 from concours_programme p
                where p.event_id = e.id
                  and p.inscription_id::text = any (v_ids)
             )
    ) ev;

  return jsonb_build_object('ok', true, 'concours', v_result);
end
$$;

-- Seule cette fonction est appelable depuis le site public.
revoke all on function mon_programme_concours(text, text, text) from public;
grant execute on function mon_programme_concours(text, text, text) to anon, authenticated;
revoke all on function edg_norm(text) from public;
revoke all on function edg_contact_ok(text, text, text) from public;
grant execute on function edg_norm(text) to authenticated;
grant execute on function edg_contact_ok(text, text, text) to authenticated;
