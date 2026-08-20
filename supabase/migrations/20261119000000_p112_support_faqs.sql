-- P112 · FAQs del modulo de soporte
-- Catalogo global de preguntas frecuentes. Escritura: organizador aprobado
-- o super admin. Lectura publica de filas activas (para la fase de ayuda).

create table if not exists public.support_faqs (
  id uuid primary key default gen_random_uuid(),
  question varchar(180) not null,
  answer text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_faqs_question_len check (
    char_length(btrim(question)) between 3 and 180
  ),
  constraint support_faqs_answer_len check (
    char_length(btrim(answer)) between 3 and 8000
  )
);

create index if not exists support_faqs_order_idx
  on public.support_faqs (sort_order asc, created_at asc);

create index if not exists support_faqs_active_order_idx
  on public.support_faqs (is_active, sort_order asc);

drop trigger if exists support_faqs_set_updated_at on public.support_faqs;
create trigger support_faqs_set_updated_at
before update on public.support_faqs
for each row execute function public.set_updated_at();

alter table public.support_faqs enable row level security;

drop policy if exists support_faqs_select on public.support_faqs;
create policy support_faqs_select
on public.support_faqs
for select
to anon, authenticated
using (
  is_active = true
  or public.is_super_admin()
  or public.is_approved_organizer((select auth.uid()))
);

drop policy if exists support_faqs_insert on public.support_faqs;
create policy support_faqs_insert
on public.support_faqs
for insert
to authenticated
with check (
  public.is_super_admin()
  or public.is_approved_organizer((select auth.uid()))
);

drop policy if exists support_faqs_update on public.support_faqs;
create policy support_faqs_update
on public.support_faqs
for update
to authenticated
using (
  public.is_super_admin()
  or public.is_approved_organizer((select auth.uid()))
)
with check (
  public.is_super_admin()
  or public.is_approved_organizer((select auth.uid()))
);

drop policy if exists support_faqs_delete on public.support_faqs;
create policy support_faqs_delete
on public.support_faqs
for delete
to authenticated
using (
  public.is_super_admin()
  or public.is_approved_organizer((select auth.uid()))
);

grant select on public.support_faqs to anon, authenticated;
grant insert, update, delete on public.support_faqs to authenticated;

comment on table public.support_faqs is
  'Preguntas frecuentes del modulo de soporte. Entidades individuales; no se fusionan.';
