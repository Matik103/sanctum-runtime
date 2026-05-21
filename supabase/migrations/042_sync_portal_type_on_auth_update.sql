-- Keep profiles.portal_type in sync when OAuth users return with updated metadata.

create or replace function public.handle_auth_user_updated ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  provider text;
  portal text;
begin
  provider := coalesce(
    nullif(trim(new.raw_user_meta_data->>'auth_provider'), ''),
    nullif(trim(new.raw_app_meta_data->>'provider'), ''),
    (select p.auth_provider from public.profiles p where p.id = new.id)
  );

  portal := coalesce(
    nullif(trim(new.raw_user_meta_data->>'portal_type'), ''),
    (select p.portal_type from public.profiles p where p.id = new.id)
  );
  if portal is not null and portal not in ('operator', 'enterprise') then
    portal := null;
  end if;

  update public.profiles
  set
    email = new.email,
    display_name = coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      display_name
    ),
    auth_provider = provider,
    portal_type = coalesce(portal, portal_type),
    last_sign_in_at = new.last_sign_in_at,
    updated_at = now()
  where id = new.id;

  return new;
end;
$$;
