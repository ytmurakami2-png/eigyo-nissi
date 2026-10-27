-- 毎朝6時（日本時間）に、全員のカレンダーの⭐の予定を日誌に入れる。<PROJECT_REF> と <合言葉> を入れて SQL Editor で一度だけ実行する。
-- 合言葉は app_secrets 表に置く（誰も読めない。Edge Function だけが読む）
create table if not exists public.app_secrets (key text primary key, value text not null);
alter table public.app_secrets enable row level security;
insert into public.app_secrets (key, value) values ('cron_secret', '<合言葉>') on conflict (key) do nothing;
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('cal-sync', '0 21 * * *', $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/cal-sync',
    headers := jsonb_build_object('x-cron-secret', (select value from public.app_secrets where key = 'cron_secret'), 'Content-Type', 'application/json'),
    body := '{}'::jsonb)
$$);
