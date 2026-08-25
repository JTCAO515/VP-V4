create policy "review probe reviewer reads other author"
on public.review_probe_changes for select to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'reviewer_probe'
  and (select auth.uid()) <> author_id
);
