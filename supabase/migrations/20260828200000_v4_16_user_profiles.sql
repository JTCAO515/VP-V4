-- V4-16: explicit account and travel preferences. This is intentionally separate from Memory.
create table public.user_profiles (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 80),
  travel_pace text not null default 'balanced' check (travel_pace in ('relaxed', 'balanced', 'packed')),
  locale text not null default 'zh' check (locale in ('zh', 'en', 'es', 'ru', 'ar')),
  currency text not null default 'CNY' check (currency in ('CNY', 'USD', 'EUR', 'RUB', 'SAR')),
  distance_unit text not null default 'kilometre' check (distance_unit in ('kilometre', 'mile')),
  temperature_unit text not null default 'celsius' check (temperature_unit in ('celsius', 'fahrenheit')),
  default_departure_time time not null default '09:00:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;
revoke all on public.user_profiles from anon;
grant select on public.user_profiles to authenticated;
grant select, insert, update, delete on public.user_profiles to service_role;
create policy "user profile owner selects" on public.user_profiles for select to authenticated using ((select auth.uid()) = owner_id);

create function public.save_user_profile(
  p_display_name text,
  p_travel_pace text,
  p_locale text,
  p_currency text,
  p_distance_unit text,
  p_temperature_unit text,
  p_default_departure_time time
)
returns table(owner_id uuid, updated_at timestamptz)
language plpgsql security definer set search_path = public, auth
as $$
begin
  if (select auth.uid()) is null then raise exception 'FORBIDDEN'; end if;
  if nullif(trim(p_display_name), '') is not null and char_length(trim(p_display_name)) not between 1 and 80 then raise exception 'INVALID_PROFILE'; end if;
  if p_travel_pace not in ('relaxed', 'balanced', 'packed') or p_locale not in ('zh', 'en', 'es', 'ru', 'ar') or p_currency not in ('CNY', 'USD', 'EUR', 'RUB', 'SAR') or p_distance_unit not in ('kilometre', 'mile') or p_temperature_unit not in ('celsius', 'fahrenheit') then raise exception 'INVALID_PROFILE'; end if;
  insert into public.user_profiles(owner_id, display_name, travel_pace, locale, currency, distance_unit, temperature_unit, default_departure_time)
    values ((select auth.uid()), nullif(trim(p_display_name), ''), p_travel_pace, p_locale, p_currency, p_distance_unit, p_temperature_unit, p_default_departure_time)
  on conflict (owner_id) do update set display_name = excluded.display_name, travel_pace = excluded.travel_pace, locale = excluded.locale, currency = excluded.currency, distance_unit = excluded.distance_unit, temperature_unit = excluded.temperature_unit, default_departure_time = excluded.default_departure_time, updated_at = now();
  return query select profile.owner_id, profile.updated_at from public.user_profiles profile where profile.owner_id = (select auth.uid());
end;
$$;
revoke all on function public.save_user_profile(text, text, text, text, text, text, time) from public;
grant execute on function public.save_user_profile(text, text, text, text, text, text, time) to authenticated;
