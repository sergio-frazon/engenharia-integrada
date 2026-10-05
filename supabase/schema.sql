create table public.ei_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Usuário' check (length(display_name) between 1 and 120),
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);
create table public.ei_works (
  user_id uuid not null references public.ei_profiles(user_id) on delete cascade,
  id text not null check (length(id) between 1 and 100),
  name text not null check (length(trim(name)) > 0),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  budget numeric(16,2) not null check (budget >= 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  primary key (user_id, id)
);
create table public.ei_entries (
  user_id uuid not null,
  id text not null check (length(id) between 1 and 100),
  work_id text not null,
  kind text not null check (kind in ('Projetos','Orçamento','Cronograma','Diário de obra','Equipes','Materiais','Equipamentos','Financeiro')),
  occurred_on date not null,
  source_id text,
  dependency_id text,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  primary key (user_id, id),
  unique (user_id, work_id, id),
  foreign key (user_id, work_id) references public.ei_works(user_id, id) on delete cascade,
  foreign key (user_id, work_id, source_id) references public.ei_entries(user_id, work_id, id) deferrable initially deferred,
  foreign key (user_id, work_id, dependency_id) references public.ei_entries(user_id, work_id, id) deferrable initially deferred,
  check (length(trim(payload->>'name')) > 0),
  check (coalesce((payload->>'progress')::numeric,0) between 0 and 100),
  check (coalesce((payload->>'amount')::numeric,0) >= 0),
  check (coalesce((payload->>'quantity')::numeric,0) >= 0),
  check (coalesce((payload->>'price')::numeric,0) >= 0),
  check (coalesce((payload->>'labor')::numeric,0) >= 0),
  check (coalesce((payload->>'equipment')::numeric,0) >= 0),
  check (source_id is null or kind = 'Financeiro'),
  check (dependency_id is null or kind = 'Cronograma')
);
create index ei_entries_work_date on public.ei_entries(user_id, work_id, occurred_on);
create index ei_entries_source on public.ei_entries(user_id, work_id, source_id) where source_id is not null;
create index ei_entries_dependency on public.ei_entries(user_id, work_id, dependency_id) where dependency_id is not null;
create unique index ei_entries_one_payable on public.ei_entries(user_id, source_id) where source_id is not null;
alter table public.ei_profiles enable row level security;
alter table public.ei_works enable row level security;
alter table public.ei_entries enable row level security;
create policy ei_profiles_owner on public.ei_profiles for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ei_works_owner on public.ei_works for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ei_entries_owner on public.ei_entries for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.ei_profiles, public.ei_works, public.ei_entries from anon;
grant select, insert, update, delete on public.ei_profiles, public.ei_works, public.ei_entries to authenticated;

create function public.ei_load_state() returns jsonb language plpgsql security invoker set search_path = '' as $$
declare uid uuid := auth.uid(); result jsonb;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select jsonb_build_object(
    'revision', p.revision,
    'data', jsonb_build_object('profile', p.display_name,
      'works', coalesce((select jsonb_agg(w.payload order by w.id) from public.ei_works w where w.user_id=uid), '[]'::jsonb),
      'entries', coalesce((select jsonb_agg(e.payload order by e.occurred_on,e.id) from public.ei_entries e where e.user_id=uid), '[]'::jsonb))
  ) into result from public.ei_profiles p where p.user_id=uid;
  return result;
end $$;
revoke all on function public.ei_load_state() from public, anon;
grant execute on function public.ei_load_state() to authenticated;

create function public.ei_save_state(p_expected_revision bigint, p_data jsonb) returns bigint language plpgsql security invoker set search_path = '' as $$
declare uid uuid := auth.uid(); current_revision bigint; row_data jsonb; next_revision bigint;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if jsonb_typeof(p_data->'works') is distinct from 'array' or jsonb_typeof(p_data->'entries') is distinct from 'array'
     or jsonb_array_length(p_data->'works') < 1
     or length(trim(coalesce(p_data->>'profile',''))) not between 1 and 120 then
    raise exception 'INVALID_DATA' using errcode='22023';
  end if;
  if p_expected_revision = -1 then
    insert into public.ei_profiles(user_id,display_name) values(uid,p_data->>'profile') on conflict(user_id) do nothing;
  end if;
  select revision into current_revision from public.ei_profiles where user_id=uid for update;
  if current_revision is null or current_revision <> greatest(0,p_expected_revision) or (p_expected_revision = -1 and exists(select 1 from public.ei_works where user_id=uid)) then
    raise exception 'STATE_CONFLICT' using errcode='40001';
  end if;
  if exists(select 1 from public.ei_entries old
    where old.user_id=uid and nullif(old.payload->>'paid','') is not null
    and not exists(select 1 from jsonb_array_elements(p_data->'entries') incoming where incoming->>'id'=old.id and incoming=old.payload)) then
    raise exception 'PAID_RECORD_IMMUTABLE' using errcode='22023';
  end if;
  if exists(select 1 from (
      select item->>'work' work_id, lower(trim(item->>'name')) name,
        sum(case when item->>'movement'='Entrada' then 1 else -1 end * coalesce((item->>'quantity')::numeric,0)) balance
      from jsonb_array_elements(p_data->'entries') item where item->>'kind'='Materiais'
      group by item->>'work', lower(trim(item->>'name'))
    ) stocks where balance < 0) then
    raise exception 'NEGATIVE_STOCK' using errcode='22023';
  end if;
  for row_data in select value from jsonb_array_elements(p_data->'works') loop
    insert into public.ei_works(user_id,id,name,start_date,end_date,budget,payload)
    values(uid,row_data->>'id',row_data->>'name',(row_data->>'start')::date,(row_data->>'end')::date,(row_data->>'budget')::numeric,row_data)
    on conflict(user_id,id) do update set name=excluded.name,start_date=excluded.start_date,end_date=excluded.end_date,budget=excluded.budget,payload=excluded.payload;
  end loop;
  for row_data in select value from jsonb_array_elements(p_data->'entries') loop
    if row_data ? 'file' or row_data ? 'photos' then raise exception 'USE_PRIVATE_STORAGE' using errcode='22023'; end if;
    insert into public.ei_entries(user_id,id,work_id,kind,occurred_on,source_id,dependency_id,payload)
    values(uid,row_data->>'id',row_data->>'work',row_data->>'kind',(row_data->>'date')::date,nullif(row_data->>'source',''),nullif(row_data->>'dependency',''),row_data)
    on conflict(user_id,id) do update set work_id=excluded.work_id,kind=excluded.kind,occurred_on=excluded.occurred_on,source_id=excluded.source_id,dependency_id=excluded.dependency_id,payload=excluded.payload;
  end loop;
  delete from public.ei_entries e where e.user_id=uid and not exists(select 1 from jsonb_array_elements(p_data->'entries') incoming where incoming->>'id'=e.id);
  delete from public.ei_works w where w.user_id=uid and not exists(select 1 from jsonb_array_elements(p_data->'works') incoming where incoming->>'id'=w.id);
  update public.ei_profiles set display_name=p_data->>'profile',revision=revision+1,updated_at=now() where user_id=uid returning revision into next_revision;
  return next_revision;
end $$;
revoke all on function public.ei_save_state(bigint,jsonb) from public, anon;
grant execute on function public.ei_save_state(bigint,jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit)
values('engenharia-arquivos','engenharia-arquivos',false,2097152);
create policy ei_files_read on storage.objects for select to authenticated using(bucket_id='engenharia-arquivos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy ei_files_insert on storage.objects for insert to authenticated with check(bucket_id='engenharia-arquivos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy ei_files_delete on storage.objects for delete to authenticated using(bucket_id='engenharia-arquivos' and (storage.foldername(name))[1]=(select auth.uid())::text);
