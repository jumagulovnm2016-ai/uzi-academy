-- ============================================================================
-- Академия УЗИ — исправление к скрипту 1 (запустить один раз, если скрипт 1
-- уже был запущен до 7.11.2026, 23:00). Аккаунты «по коду»: Supabase Auth
-- записывает служебные данные вторым шагом, поэтому активация — отдельным триггером.
-- ============================================================================
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, status)
  values (
    new.id,
    left(coalesce(trim(new.raw_user_meta_data ->> 'full_name'), ''), 120),
    case when new.email like '%@uzi-academy.invalid' then 'blocked' else 'pending' end
  );
  return new;
end;
$$;

create or replace function public.handle_teacher_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce((new.raw_app_meta_data ->> 'by_teacher')::boolean, false)
     and not coalesce((old.raw_app_meta_data ->> 'by_teacher')::boolean, false) then
    update profiles set
      login     = new.raw_app_meta_data ->> 'login',
      status    = 'active',
      group_id  = nullif(new.raw_app_meta_data ->> 'group_id', '')::uuid,
      full_name = case when full_name = '' then left(coalesce(trim(new.raw_user_meta_data ->> 'full_name'), ''), 120) else full_name end
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_by_teacher on auth.users;
create trigger on_auth_user_by_teacher
  after update of raw_app_meta_data on auth.users
  for each row execute function public.handle_teacher_created();
