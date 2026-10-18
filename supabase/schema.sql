-- 営業日誌のデータベース。Supabase の SQL Editor に貼り付けて一度だけ実行する。
-- 最初に登録した人が管理者（社長）になる。社員は自分の記録だけ、管理者は全員分を見られる。

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null default '',
  name text not null default '',
  dept text not null default '',
  home text not null default '',
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.records (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists records_user_idx on public.records (user_id);

create table if not exists public.approvals (
  record_id text primary key references public.records on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  data jsonb not null
);

create table if not exists public.settings (
  key text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- 管理者かどうか
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- 承認済みの記録は本人でも変えられない
create or replace function public.is_approved(rid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.approvals a where a.record_id = rid and coalesce((a.data->>'returned')::boolean, false) = false)
$$;

-- 登録した時に名簿を作る。最初の1人は管理者
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, is_admin)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'name', ''),
          not exists (select 1 from public.profiles));
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.records enable row level security;
alter table public.approvals enable row level security;
alter table public.settings enable row level security;

-- 名簿：自分の行と、管理者は全員分
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_write on public.profiles;
create policy profiles_write on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (name, dept, home) on public.profiles to authenticated;

-- 記録：本人が書く。管理者は読むだけ
drop policy if exists records_read on public.records;
create policy records_read on public.records for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists records_insert on public.records;
create policy records_insert on public.records for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists records_update on public.records;
create policy records_update on public.records for update to authenticated
  using (user_id = auth.uid() and not public.is_approved(id)) with check (user_id = auth.uid());
drop policy if exists records_delete on public.records;
create policy records_delete on public.records for delete to authenticated
  using (user_id = auth.uid() and not public.is_approved(id));

-- 承認：本人は読むだけ、管理者が付ける
drop policy if exists approvals_read on public.approvals;
create policy approvals_read on public.approvals for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists approvals_write on public.approvals;
create policy approvals_write on public.approvals for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 旅費規程と等級：全員が読み、管理者が書く
drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select to authenticated using (true);
drop policy if exists settings_write on public.settings;
create policy settings_write on public.settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 他の端末での変更をすぐ届ける
do $$ begin
  alter publication supabase_realtime add table public.records, public.approvals, public.settings, public.profiles;
exception when others then null; end $$;
