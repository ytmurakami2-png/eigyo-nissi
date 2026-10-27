-- 毎朝6時（日本時間）に、全員のカレンダーの⭐の予定を日誌に入れる。
-- <PROJECT_REF> と <SERVICE_ROLE_KEY> を入れて、SQL Editor で一度だけ実行する。
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('cal-sync') where exists (select 1 from cron.job where jobname = 'cal-sync');
select cron.schedule('cal-sync', '0 21 * * *', $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/cal-sync',
    headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb)
$$);
