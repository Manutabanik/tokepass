-- P128 · FAQs: categoria + escritura solo Super Admin
-- Las productoras consultan filas publicadas. El CRUD vive en Super Admin.

alter table public.support_faqs
  add column if not exists category text not null default 'ventas';

update public.support_faqs
set category = 'ventas'
where category is null or btrim(category) = '';

alter table public.support_faqs
  drop constraint if exists support_faqs_category_check;

alter table public.support_faqs
  add constraint support_faqs_category_check
  check (category in ('ventas', 'cobros', 'accesos', 'equipos'));

create index if not exists support_faqs_category_order_idx
  on public.support_faqs (category, sort_order asc, created_at asc);

drop policy if exists support_faqs_select on public.support_faqs;
create policy support_faqs_select
on public.support_faqs
for select
to anon, authenticated
using (
  is_active = true
  or public.is_super_admin()
);

drop policy if exists support_faqs_insert on public.support_faqs;
create policy support_faqs_insert
on public.support_faqs
for insert
to authenticated
with check (public.is_super_admin());

drop policy if exists support_faqs_update on public.support_faqs;
create policy support_faqs_update
on public.support_faqs
for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists support_faqs_delete on public.support_faqs;
create policy support_faqs_delete
on public.support_faqs
for delete
to authenticated
using (public.is_super_admin());

comment on column public.support_faqs.category is
  'Agrupacion de consulta: ventas, cobros, accesos, equipos.';
