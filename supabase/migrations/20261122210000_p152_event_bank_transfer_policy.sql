-- P152: separar transferencia bancaria de cobro POS en el paso Publicar.

alter table public.events
  add column if not exists accepts_bank_transfer boolean not null default true;

comment on column public.events.accepts_bank_transfer is
  'Si el evento acepta transferencia bancaria con validación manual de comprobante.';

comment on column public.events.accepts_pos_payments is
  'Si el evento acepta cobro presencial en taquilla / POS.';

update public.events
set accepts_bank_transfer = accepts_pos_payments
where accepts_bank_transfer is distinct from accepts_pos_payments;
