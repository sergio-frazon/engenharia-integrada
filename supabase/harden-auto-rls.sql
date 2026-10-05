-- The event trigger still runs as its database owner; clients must not invoke it through the API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
