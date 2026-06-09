-- =========================================================================
-- Zenfocus - Database Schema and Security Policies Configuration SQL
-- 
-- Execution steps:
-- 1. Log in to your Supabase Dashboard -> select SQL Editor in the sidebar.
-- 2. Click "New query" to open a blank editor page.
-- 3. Copy and paste all the SQL code inside this file.
-- 4. Click the "Run" button in the bottom right corner to execute!
-- =========================================================================

-- 1. Create focus_tasks Table
create table if not exists public.focus_tasks (
  id text primary key,
  user_id uuid references auth.users on delete cascade not null,
  title text not null,
  category text default 'work'::text not null,
  completed boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Enable RLS on focus_tasks
alter table public.focus_tasks enable row level security;

-- 3. Create security policies for focus_tasks (restricted to owner and approved users)
drop policy if exists "Users can create their own focus tasks if approved" on public.focus_tasks;
create policy "Users can create their own focus tasks if approved"
  on public.focus_tasks for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.approved = true
    )
  );

drop policy if exists "Users can view their own focus tasks if approved" on public.focus_tasks;
create policy "Users can view their own focus tasks if approved"
  on public.focus_tasks for select
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.approved = true
    )
  );

drop policy if exists "Users can update their own focus tasks if approved" on public.focus_tasks;
create policy "Users can update their own focus tasks if approved"
  on public.focus_tasks for update
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.approved = true
    )
  );

drop policy if exists "Users can delete their own focus tasks if approved" on public.focus_tasks;
create policy "Users can delete their own focus tasks if approved"
  on public.focus_tasks for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.approved = true
    )
  );


-- 4. Create focus_sessions Table (History logs)
create table if not exists public.focus_sessions (
  id text primary key,
  user_id uuid references auth.users on delete cascade not null,
  task_title text not null,
  category text default 'work'::text not null,
  duration integer not null, -- in minutes
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Enable RLS on focus_sessions
alter table public.focus_sessions enable row level security;

-- 6. Create security policies for focus_sessions
drop policy if exists "Users can insert their own focus sessions if approved" on public.focus_sessions;
create policy "Users can insert their own focus sessions if approved"
  on public.focus_sessions for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.approved = true
    )
  );

drop policy if exists "Users can view their own focus sessions if approved" on public.focus_sessions;
create policy "Users can view their own focus sessions if approved"
  on public.focus_sessions for select
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.approved = true
    )
  );
