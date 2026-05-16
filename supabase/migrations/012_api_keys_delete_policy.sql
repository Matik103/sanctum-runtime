-- Allow owners to delete their API keys (service role already bypasses RLS)

create policy "api_keys_delete_own"
  on public.api_keys for delete
  using (user_id = auth.uid());
