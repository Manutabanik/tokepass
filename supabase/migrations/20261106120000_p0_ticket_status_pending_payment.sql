-- P0: add pre-payment ticket status (must commit before use in later migration).
alter type public.ticket_status add value if not exists 'pending_payment';
