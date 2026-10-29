-- OPTIONAL: drive the LifePilot scheduler from Supabase instead of Vercel Cron
-- (useful on Vercel Hobby, where cron jobs can run at most once per day).
-- Run in the Supabase SQL editor after enabling the pg_cron and pg_net extensions
-- (Database → Extensions). Replace the URL and secret placeholders first.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'lifepilot-tick',
  '* * * * *', -- every minute
  $$
  select net.http_post(
    url := 'https://YOUR-APP.vercel.app/api/cron/tick',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET', 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- To stop it:  select cron.unschedule('lifepilot-tick');
-- To inspect:  select * from cron.job_run_details order by start_time desc limit 20;
