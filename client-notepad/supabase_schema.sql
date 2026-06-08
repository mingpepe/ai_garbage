-- =========================================================================
-- Zenote - Supabase User Approval and Database Schema Configuration SQL
-- 
-- Execution steps:
-- 1. Log in to your Supabase Dashboard -> select SQL Editor in the sidebar.
-- 2. Click "New query" to open a blank editor page.
-- 3. Copy and paste all the SQL code inside this file.
-- 4. Click the "Run" button in the bottom right corner to execute!
-- =========================================================================

-- 1. Create Profiles Table (Stores user sign up approval states)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  approved boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Enable RLS on Profiles (Allows authenticated users to read their own approval row)
alter table public.profiles enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- 3. Create Trigger Function to automatically insert a row in profiles when a user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, approved)
  values (new.id, new.email, false);
  return new;
  exception when others then
    return new;
end;
$$ language plpgsql security definer;

-- 4. Bind the Trigger to auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 5. Backfill profiles for any pre-existing users (defaults to approved = false)
insert into public.profiles (id, email, approved)
select id, email, false from auth.users
on conflict (id) do nothing;

-- 6. Upgrade RLS on the notes table (user must be owner AND approved = true)
drop policy if exists "Users can create their own notes" on notes;
drop policy if exists "Users can view their own notes" on notes;
drop policy if exists "Users can update their own notes" on notes;
drop policy if exists "Users can delete their own notes" on notes;
drop policy if exists "Users can create their own notes if approved" on notes;
drop policy if exists "Users can view their own notes if approved" on notes;
drop policy if exists "Users can update their own notes if approved" on notes;
drop policy if exists "Users can delete their own notes if approved" on notes;

create policy "Users can create their own notes if approved"
  on notes for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.approved = true
    )
  );

create policy "Users can view their own notes if approved"
  on notes for select
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.approved = true
    )
  );

create policy "Users can update their own notes if approved"
  on notes for update
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.approved = true
    )
  );

create policy "Users can delete their own notes if approved"
  on notes for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.approved = true
    )
  );
