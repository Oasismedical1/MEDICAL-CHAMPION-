-- Run this in Supabase: Project → SQL Editor → New query → paste → Run

create table patients (
  id uuid primary key default gen_random_uuid(),
  upi text unique not null,
  first_name text not null,
  middle_name text,
  surname text not null,
  sex text,
  dob date,
  nin text,
  phone text,
  village text,
  subcounty text,
  district text,
  ec_name text,
  ec_phone text,
  blood_group text,
  allergies text,
  chronic_conditions text,
  created_at timestamptz default now()
);

-- Enable Row Level Security, then allow the anon (public) key to read/write.
-- This is fine for a single-facility internal tool behind your own link;
-- tighten this later once you add real user login (see SETUP.md).
alter table patients enable row level security;

create policy "Allow anon read" on patients
  for select using (true);

create policy "Allow anon insert" on patients
  for insert with check (true);
