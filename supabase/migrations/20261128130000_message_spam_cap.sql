-- DARKLINK — server-side message spam cap (2026-11-28)
-- Messages reach public.messages via direct client INSERT (app/src/services/chat.ts
-- insertMessage: sendTextMessage / sendMediaMessage / sendVoiceMessage) and via the
-- send_gift RPC (one gift message per gift). This BEFORE INSERT trigger caps both
-- paths at the DB level, so no client can bypass it.
--
-- Limits (per sender, counting only non-deleted messages):
--   * 20 messages per rolling minute  (a fast human chat burst stays under this;
--     the demo account's auto-reply cron answers at most ~1 message per 5 min)
--   * 300 messages per rolling day    (generous for normal all-day chatting)
-- A capped send raises a Postgres exception; PostgREST returns it as an error and
-- the client's insertMessage() returns null (message not sent, no crash). The app
-- workstream may surface a friendly "too fast" notice from that null/error.
create index if not exists messages_sender_time
    on public.messages (sender_id, created_at desc);

create or replace function public.check_message_rate()
returns trigger language plpgsql as $$
declare
    minute_count int;
    day_count int;
begin
    select count(*) into minute_count from public.messages
     where sender_id = new.sender_id
       and not is_deleted
       and created_at > now() - interval '1 minute';
    if minute_count >= 20 then
        raise exception 'rate_limit_minute: max 20 messages per minute';
    end if;

    select count(*) into day_count from public.messages
     where sender_id = new.sender_id
       and not is_deleted
       and created_at > now() - interval '1 day';
    if day_count >= 300 then
        raise exception 'rate_limit_day: max 300 messages per day';
    end if;

    return new;
end $$;

drop trigger if exists messages_rate_cap on public.messages;
create trigger messages_rate_cap
    before insert on public.messages
    for each row execute function public.check_message_rate();
