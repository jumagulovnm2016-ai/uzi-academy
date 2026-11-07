-- ============================================================================
-- Академия УЗИ — личные кабинеты (Supabase). Скрипт 1 из 2.
-- Запустить ОДИН раз: Supabase → SQL Editor → New query → вставить всё → Run.
--
-- Что создаётся:
--   groups      — учебные группы
--   profiles    — курсанты и преподаватель (по одному на аккаунт)
--   attempts    — результаты тестов, экзаменов и игр
--   srs_cards   — расписание интервального повторения (FSRS) каждого курсанта
-- Правила доступа (RLS): курсант видит только себя и свои результаты;
-- преподаватель — всех. Роль, статус и группу меняет только преподаватель.
-- ============================================================================

-- ---------- таблицы ----------
create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 80),
  created_at  timestamptz not null default now()
);

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '' check (length(full_name) <= 120),
  login       text unique check (login ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),  -- только у аккаунтов «по коду»
  role        text not null default 'student' check (role in ('student', 'teacher')),
  status      text not null default 'pending' check (status in ('pending', 'active', 'blocked')),
  group_id    uuid references public.groups(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.attempts (
  id            bigint generated always as identity primary key,
  user_id       uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  client_id     text not null check (length(client_id) between 8 and 64),     -- защита от двойной отправки
  test_id       text not null check (test_id ~ '^[a-z0-9-]{1,80}$'),
  title         text not null check (length(title) <= 200),
  mode          text not null check (mode in ('study', 'exam', 'review', 'game', 'srs')),
  correct       int  not null check (correct >= 0),
  total         int  not null check (total > 0 and correct <= total),
  percent       int  generated always as (round(100.0 * correct / total)) stored,
  points        int  check (points >= 0),                                    -- баллы в играх «на время»
  duration_sec  int  check (duration_sec >= 0),
  timed_out     boolean not null default false,
  seed          text check (seed ~ '^[0-9A-Z]{6}$'),                         -- вариант сборного экзамена
  wrong_ids     text[] not null default '{}',                                 -- id вопросов с ошибкой
  report        text check (length(report) <= 4000),
  finished_at   timestamptz not null default now(),
  unique (user_id, client_id)
);
create index attempts_user_idx on public.attempts (user_id, finished_at desc);
create index attempts_test_idx on public.attempts (test_id);

create table public.srs_cards (
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  qid         text not null check (qid ~ '^[a-z0-9-]{1,100}$'),
  card        jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, qid)
);

-- ---------- вспомогательные функции (без рекурсии RLS) ----------
create function public.is_teacher() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'teacher' and status = 'active');
$$;

create function public.is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'active');
$$;

create function public.my_group() returns uuid
language sql stable security definer set search_path = public as $$
  select group_id from profiles where id = auth.uid();
$$;

-- ---------- новый аккаунт → профиль ----------
-- Аккаунты «по коду» создаёт только серверная функция преподавателя: она ставит
-- app_metadata.by_teacher = true (обычный пользователь app_metadata задать не может).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  by_teacher boolean := coalesce((new.raw_app_meta_data ->> 'by_teacher')::boolean, false);
begin
  if new.email like '%@uzi-academy.invalid' and not by_teacher then
    raise exception 'Этот адрес зарезервирован для аккаунтов, созданных преподавателем';
  end if;
  insert into profiles (id, full_name, login, status, group_id)
  values (
    new.id,
    left(coalesce(trim(new.raw_user_meta_data ->> 'full_name'), ''), 120),
    case when by_teacher then new.raw_app_meta_data ->> 'login' end,
    case when by_teacher then 'active' else 'pending' end,
    case when by_teacher then nullif(new.raw_app_meta_data ->> 'group_id', '')::uuid end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- действия преподавателя ----------
create function public.teacher_set_student(p_user uuid, p_status text, p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_teacher() then raise exception 'Только для преподавателя'; end if;
  if p_status not in ('pending', 'active', 'blocked') then raise exception 'Неверный статус'; end if;
  update profiles set status = p_status, group_id = p_group
   where id = p_user and role = 'student';
  if not found then raise exception 'Курсант не найден'; end if;
end;
$$;

create function public.teacher_rename(p_user uuid, p_full_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_teacher() then raise exception 'Только для преподавателя'; end if;
  update profiles set full_name = left(trim(p_full_name), 120) where id = p_user;
end;
$$;

-- ---------- правила доступа (RLS) ----------
alter table public.groups    enable row level security;
alter table public.profiles  enable row level security;
alter table public.attempts  enable row level security;
alter table public.srs_cards enable row level security;

-- анонимным посетителям — ничего
revoke all on public.groups, public.profiles, public.attempts, public.srs_cards from anon;
revoke all on function public.teacher_set_student(uuid, text, uuid), public.teacher_rename(uuid, text) from anon, public;
grant execute on function public.teacher_set_student(uuid, text, uuid), public.teacher_rename(uuid, text) to authenticated;

-- groups: курсант видит свою группу, преподаватель — все и управляет ими
create policy groups_select on public.groups for select to authenticated
  using (is_teacher() or id = my_group());
create policy groups_write on public.groups for all to authenticated
  using (is_teacher()) with check (is_teacher());

-- profiles: курсант видит себя и может поменять только своё ФИО; преподаватель видит всех
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or is_teacher());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

-- attempts: сохранять может только подтверждённый курсант и только свои; изменять и удалять — никто
create policy attempts_select on public.attempts for select to authenticated
  using (user_id = auth.uid() or is_teacher());
create policy attempts_insert on public.attempts for insert to authenticated
  with check (user_id = auth.uid() and is_active());
revoke update, delete on public.attempts from authenticated;

-- srs_cards: курсант ведёт своё расписание; преподаватель только смотрит
create policy srs_select on public.srs_cards for select to authenticated
  using (user_id = auth.uid() or is_teacher());
create policy srs_insert on public.srs_cards for insert to authenticated
  with check (user_id = auth.uid() and is_active());
create policy srs_update on public.srs_cards for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy srs_delete on public.srs_cards for delete to authenticated
  using (user_id = auth.uid());
