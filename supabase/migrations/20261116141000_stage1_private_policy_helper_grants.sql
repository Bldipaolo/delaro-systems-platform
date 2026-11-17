-- RLS evaluates these private helpers as the authenticated caller.
-- They expose only booleans and remain unavailable through the public Data API schema.
grant execute on function private.is_delaro_admin() to authenticated;
grant execute on function private.can_bootstrap_owned_organization(uuid) to authenticated;
