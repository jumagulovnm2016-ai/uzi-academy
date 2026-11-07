-- ============================================================================
-- Академия УЗИ — скрипт 7: один аккаунт курсанта — одно устройство.
-- При входе на новом устройстве все прежние сеансы этого курсанта завершаются,
-- и на старом устройстве при следующем открытии страницы происходит выход.
-- Преподавателя не касается (можно работать с телефона и компьютера).
-- Запустить один раз: SQL Editor → New query → вставить → Run.
-- ============================================================================
create or replace function public.keep_only_this_session()
returns integer language plpgsql security definer set search_path = public, auth as $$
declare
  me uuid := auth.uid();
  sid uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  n integer;
begin
  if me is null or sid is null then return 0; end if;
  if exists (select 1 from profiles where id = me and role = 'teacher') then return 0; end if;
  delete from auth.refresh_tokens where user_id = me::text and session_id is distinct from sid;
  delete from auth.sessions where user_id = me and id <> sid;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.keep_only_this_session() from anon, public;
grant execute on function public.keep_only_this_session() to authenticated;
