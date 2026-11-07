-- ============================================================================
-- Академия УЗИ — скрипт 3: данные для кабинета преподавателя.
-- Почта и время последнего входа хранятся в служебной таблице Supabase Auth,
-- куда у сайта доступа нет. Эта функция отдаёт их только преподавателю.
-- Запустить один раз: SQL Editor → New query → вставить → Run.
-- ============================================================================
create or replace function public.teacher_users_meta()
returns table (id uuid, email text, last_sign_in_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not is_teacher() then raise exception 'Только для преподавателя'; end if;
  return query
    select u.id,
           case when u.email like '%@uzi-academy.invalid' then null else u.email::text end,
           u.last_sign_in_at, u.created_at
      from auth.users u;
end;
$$;
revoke all on function public.teacher_users_meta() from anon, public;
grant execute on function public.teacher_users_meta() to authenticated;
