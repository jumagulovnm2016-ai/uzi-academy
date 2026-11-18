-- ============================================================================
-- Академия УЗИ — скрипт 8: журнал посещений курсантов.
-- Записывается каждый вход по логину/коду и каждое открытие страницы сайта:
-- дата, время первого и последнего открытия за день, страница, устройство, сколько раз.
-- Одна строка в день на страницу и устройство — база не засоряется.
-- Записи старше 180 дней удаляются автоматически. Видит журнал только преподаватель.
-- Запустить один раз: SQL Editor → New query → вставить → Run.
-- ============================================================================
create table if not exists public.visits (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  day       date not null,                                                   -- день по времени Бишкека
  page      text not null check (length(page) between 1 and 120),
  title     text check (length(title) <= 200),
  device    text not null default '' check (length(device) <= 80),
  first_at  timestamptz not null default now(),
  last_at   timestamptz not null default now(),
  hits      int not null default 1,
  primary key (user_id, day, page, device)
);
create index if not exists visits_last_idx on public.visits (user_id, last_at desc);

alter table public.visits enable row level security;
drop policy if exists visits_teacher_read on public.visits;
create policy visits_teacher_read on public.visits for select using (public.is_teacher());
-- курсанты в таблицу напрямую не пишут — только через функцию ниже

create or replace function public.log_visit(p_page text, p_title text, p_device text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  today date := (now() at time zone 'Asia/Bishkek')::date;
begin
  if me is null or p_page is null or length(p_page) not between 1 and 120 then return; end if;
  if not exists (select 1 from profiles where id = me and role = 'student') then return; end if;
  insert into visits (user_id, day, page, title, device)
    values (me, today, p_page, left(nullif(trim(p_title), ''), 200), left(coalesce(p_device, ''), 80))
  on conflict (user_id, day, page, device) do update
    set last_at = now(), hits = visits.hits + 1, title = coalesce(excluded.title, visits.title);
  delete from visits where user_id = me and day < today - 180;
end;
$$;
revoke all on function public.log_visit(text, text, text) from anon, public;
grant execute on function public.log_visit(text, text, text) to authenticated;

-- последняя активность каждого курсанта — для списка в кабинете преподавателя
create or replace function public.teacher_last_seen()
returns table (user_id uuid, last_at timestamptz, last_device text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_teacher() then raise exception 'Только для преподавателя'; end if;
  return query
    select distinct on (v.user_id) v.user_id, v.last_at, v.device
      from visits v order by v.user_id, v.last_at desc;
end;
$$;
revoke all on function public.teacher_last_seen() from anon, public;
grant execute on function public.teacher_last_seen() to authenticated;
