-- =========================================================
-- Trail Training App — schéma initial
-- Conçu pour Supabase (Postgres + auth.users + RLS)
-- =========================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------
-- profiles : un profil par utilisateur Supabase Auth
-- ---------------------------------------------------------
create table profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  preferred_run_days text[] not null default '{}',        -- ex: {'tuesday','thursday','saturday','sunday'}
  runs_per_week smallint not null default 3 check (runs_per_week between 0 and 14),
  home_strength_sessions_per_week smallint not null default 1 check (home_strength_sessions_per_week between 0 and 7),
  current_longest_run_km numeric(5,2) not null default 0 check (current_longest_run_km >= 0),
  injury_flags text[] not null default '{}',               -- ex: {'knee','ankle'}
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- race_goals : objectif(s) de course d'un utilisateur
-- ---------------------------------------------------------
create type race_goal_status as enum ('draft','active','completed','archived');

create table race_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  race_date date not null,
  distance_km numeric(6,2) not null check (distance_km > 0),
  elevation_gain_m integer not null default 0 check (elevation_gain_m >= 0),
  elevation_loss_m integer not null default 0 check (elevation_loss_m >= 0),
  terrain_technicality smallint not null default 3 check (terrain_technicality between 1 and 5), -- 1=roulant, 5=très technique
  course_profile_json jsonb not null default '{}'::jsonb,  -- ex: profil d'altitude, segments clés
  status race_goal_status not null default 'active',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- training_plans : un plan généré pour un objectif de course
-- ---------------------------------------------------------
create type plan_status as enum ('draft','active','completed','archived');

create table training_plans (
  id uuid primary key default gen_random_uuid(),
  race_goal_id uuid not null references race_goals(id) on delete cascade,
  algorithm_version text not null default 'v1',
  generated_at timestamptz not null default now(),
  start_date date not null,
  end_date date not null,
  current_status plan_status not null default 'active',
  generation_inputs_json jsonb not null default '{}'::jsonb, -- snapshot du profil + objectif au moment de la génération
  check (end_date > start_date)
);

-- ---------------------------------------------------------
-- training_weeks : découpage du plan en semaines/phases
-- ---------------------------------------------------------
create type training_phase as enum ('base','development','specific','taper');

create table training_weeks (
  id uuid primary key default gen_random_uuid(),
  training_plan_id uuid not null references training_plans(id) on delete cascade,
  week_number smallint not null check (week_number > 0),
  phase training_phase not null,
  target_duration_min integer not null default 0,
  target_distance_km numeric(6,2) not null default 0,
  target_elevation_gain_m integer not null default 0,
  recovery_week boolean not null default false,
  adaptation_reason text,                                   -- pourquoi cette semaine a été ajustée, si c'est le cas
  unique (training_plan_id, week_number)
);

-- ---------------------------------------------------------
-- workouts : séances individuelles au sein d'une semaine
-- ---------------------------------------------------------
create type workout_type as enum ('easy','interval','hills','tempo','technical','strength','long','rest','race');
create type workout_completion_status as enum ('planned','completed','skipped','modified');

create table workouts (
  id uuid primary key default gen_random_uuid(),
  training_week_id uuid not null references training_weeks(id) on delete cascade,
  type workout_type not null,
  title text not null,
  target_duration_min integer,
  target_distance_km numeric(6,2),
  target_elevation_gain_m integer,
  target_rpe smallint check (target_rpe between 1 and 10),
  instructions_json jsonb not null default '{}'::jsonb,     -- structure de la séance (répétitions, zones FC, etc.)
  scheduled_date date not null,
  completion_status workout_completion_status not null default 'planned',
  adaptation_reason text
);

-- ---------------------------------------------------------
-- workout_logs : ce qui s'est réellement passé
-- ---------------------------------------------------------
create table workout_logs (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references workouts(id) on delete cascade,
  actual_duration_min integer,
  actual_distance_km numeric(6,2),
  actual_elevation_gain_m integer,
  actual_rpe smallint check (actual_rpe between 1 and 10),
  knee_pain_during smallint check (knee_pain_during between 0 and 10) default 0,
  knee_pain_next_morning smallint check (knee_pain_next_morning between 0 and 10) default 0,
  fatigue_next_day smallint check (fatigue_next_day between 0 and 10) default 0,
  notes text,
  logged_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- Index utiles
-- ---------------------------------------------------------
create index idx_race_goals_user on race_goals(user_id);
create index idx_training_plans_goal on training_plans(race_goal_id);
create index idx_training_weeks_plan on training_weeks(training_plan_id);
create index idx_workouts_week on workouts(training_week_id);
create index idx_workouts_scheduled_date on workouts(scheduled_date);
create index idx_workout_logs_workout on workout_logs(workout_id);

-- =========================================================
-- Row Level Security : chacun ne voit / modifie que ses données
-- =========================================================
alter table profiles enable row level security;
alter table race_goals enable row level security;
alter table training_plans enable row level security;
alter table training_weeks enable row level security;
alter table workouts enable row level security;
alter table workout_logs enable row level security;

create policy "profiles_own" on profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "race_goals_own" on race_goals
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "training_plans_own" on training_plans
  for all using (
    exists (select 1 from race_goals g where g.id = race_goal_id and g.user_id = auth.uid())
  ) with check (
    exists (select 1 from race_goals g where g.id = race_goal_id and g.user_id = auth.uid())
  );

create policy "training_weeks_own" on training_weeks
  for all using (
    exists (
      select 1 from training_plans p
      join race_goals g on g.id = p.race_goal_id
      where p.id = training_plan_id and g.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from training_plans p
      join race_goals g on g.id = p.race_goal_id
      where p.id = training_plan_id and g.user_id = auth.uid()
    )
  );

create policy "workouts_own" on workouts
  for all using (
    exists (
      select 1 from training_weeks w
      join training_plans p on p.id = w.training_plan_id
      join race_goals g on g.id = p.race_goal_id
      where w.id = training_week_id and g.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from training_weeks w
      join training_plans p on p.id = w.training_plan_id
      join race_goals g on g.id = p.race_goal_id
      where w.id = training_week_id and g.user_id = auth.uid()
    )
  );

create policy "workout_logs_own" on workout_logs
  for all using (
    exists (
      select 1 from workouts wo
      join training_weeks w on w.id = wo.training_week_id
      join training_plans p on p.id = w.training_plan_id
      join race_goals g on g.id = p.race_goal_id
      where wo.id = workout_id and g.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from workouts wo
      join training_weeks w on w.id = wo.training_week_id
      join training_plans p on p.id = w.training_plan_id
      join race_goals g on g.id = p.race_goal_id
      where wo.id = workout_id and g.user_id = auth.uid()
    )
  );
