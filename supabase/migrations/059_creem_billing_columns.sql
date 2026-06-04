-- Creem billing: store subscription ids on org_plans (migrate legacy Paddle columns).

alter table public.org_plans
  add column if not exists creem_customer_id text,
  add column if not exists creem_subscription_id text;

update public.org_plans
set
  creem_customer_id = coalesce(creem_customer_id, paddle_customer_id),
  creem_subscription_id = coalesce(creem_subscription_id, paddle_subscription_id)
where paddle_customer_id is not null
   or paddle_subscription_id is not null;

alter table public.org_plans
  alter column plan_id set default 'observer';

comment on column public.org_plans.creem_customer_id is 'Creem customer id from checkout/subscription webhooks';
comment on column public.org_plans.creem_subscription_id is 'Creem subscription id from checkout/subscription webhooks';
comment on table public.org_plans is 'Per-org plan subscription and Creem billing references';
