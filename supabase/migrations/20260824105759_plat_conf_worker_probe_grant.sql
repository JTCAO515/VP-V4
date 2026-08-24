-- Worker-only probe requires an explicit table grant in addition to private schema access.
grant select on public.connection_probe_resources to service_role;
