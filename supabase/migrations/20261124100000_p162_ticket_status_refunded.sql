-- P162: ticket_status.refunded — una fila por entrada, distinta de cancelled.
-- El valor se agrega solo aqui: PostgreSQL no permite usarlo en el mismo
-- transaction que ALTER TYPE.

alter type public.ticket_status add value if not exists 'refunded';
