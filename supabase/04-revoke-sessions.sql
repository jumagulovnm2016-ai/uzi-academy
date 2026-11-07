-- ============================================================================
-- Академия УЗИ — скрипт 4: выход курсанта со всех устройств.
-- Нужен, чтобы «Отключить» и «Новый код» в кабинете преподавателя сразу
-- выкидывали курсанта, который уже вошёл на своём телефоне.
-- Запустить один раз: SQL Editor → New query → вставить → Run.
-- ============================================================================
create or replace function public.teacher_revoke_sessions(p_user uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not is_teacher() then raise exception 'Только для преподавателя'; end if;
  if exists (select 1 from profiles where id = p_user and role = 'teacher') then
    raise exception 'Нельзя завершить сеансы преподавателя';
  end if;
  delete from auth.refresh_tokens where user_id = p_user::text;
  delete from auth.sessions where user_id = p_user;
end;
$$;
revoke all on function public.teacher_revoke_sessions(uuid) from anon, public;
grant execute on function public.teacher_revoke_sessions(uuid) to authenticated;
