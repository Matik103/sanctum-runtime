-- Auto-create a personal organization for every new Supabase auth user.
-- The personal org ID is derived from the user UUID: "personal-" + first 12 hex chars.
-- This fires after INSERT on auth.users so users always have an org on first login.

CREATE OR REPLACE FUNCTION public.create_personal_org_for_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id text;
  v_email  text;
BEGIN
  -- Derive personal org ID from user UUID (strip hyphens, take first 12 chars)
  v_org_id := 'personal-' || substring(replace(NEW.id::text, '-', ''), 1, 12);
  v_email  := NEW.email;

  -- Create org if it doesn't exist
  INSERT INTO public.organizations (id, name)
  VALUES (v_org_id, COALESCE(v_email, v_org_id))
  ON CONFLICT (id) DO NOTHING;

  -- Add user as owner of their personal org
  INSERT INTO public.organization_members (org_id, user_id, role)
  VALUES (v_org_id, NEW.id, 'owner')
  ON CONFLICT (org_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Fire after every new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_personal_org_for_user();

-- Backfill: create personal orgs for all existing users who don't have one
DO $$
DECLARE
  u RECORD;
  v_org_id text;
BEGIN
  FOR u IN
    SELECT au.id, au.email
    FROM auth.users au
    WHERE NOT EXISTS (
      SELECT 1 FROM public.organization_members om WHERE om.user_id = au.id
    )
  LOOP
    v_org_id := 'personal-' || substring(replace(u.id::text, '-', ''), 1, 12);

    INSERT INTO public.organizations (id, name)
    VALUES (v_org_id, COALESCE(u.email, v_org_id))
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.organization_members (org_id, user_id, role)
    VALUES (v_org_id, u.id, 'owner')
    ON CONFLICT (org_id, user_id) DO NOTHING;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.create_personal_org_for_user() IS
  'Auto-creates a personal org (personal-{12hex}) and makes the new user its owner';
