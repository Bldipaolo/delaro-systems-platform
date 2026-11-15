alter table public.organizations
  add column demo_mode boolean not null default false;

comment on column public.organizations.demo_mode is
  'Marks an authenticated tenant workspace as containing illustrative demo data. It does not bypass authentication or RLS.';
