-- Tie existing API keys to the owner's first organization (Fleet visibility)

update public.api_keys k
set org_id = sub.org_id
from (
  select distinct on (m.user_id) m.user_id, m.org_id
  from public.organization_members m
  order by m.user_id, m.org_id
) sub
where k.user_id = sub.user_id
  and k.org_id is null
  and k.revoked_at is null;
