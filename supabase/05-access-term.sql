-- ============================================================================
-- Академия УЗИ — скрипт 5: срок доступа курсанта (например, 30 дней на курс).
-- После срока курсант может войти и посмотреть свои результаты, но тесты,
-- руководства и сохранение результатов закрываются. Срок продлевает преподаватель.
-- Запустить один раз: SQL Editor → New query → вставить → Run.
-- ============================================================================
alter table public.profiles add column if not exists access_until timestamptz;   -- пусто = без срока

-- «активен» = подтверждён и срок не истёк (на этом держатся правила сохранения результатов)
create or replace function public.is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'active'
                 and (access_until is null or access_until > now()));
$$;

create or replace function public.teacher_set_access(p_user uuid, p_until timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_teacher() then raise exception 'Только для преподавателя'; end if;
  update profiles set access_until = p_until where id = p_user and role = 'student';
  if not found then raise exception 'Курсант не найден'; end if;
end;
$$;

create or replace function public.teacher_set_group_access(p_group uuid, p_until timestamptz)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not is_teacher() then raise exception 'Только для преподавателя'; end if;
  update profiles set access_until = p_until where group_id = p_group and role = 'student';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.teacher_set_access(uuid, timestamptz), public.teacher_set_group_access(uuid, timestamptz) from anon, public;
grant execute on function public.teacher_set_access(uuid, timestamptz), public.teacher_set_group_access(uuid, timestamptz) to authenticated;
