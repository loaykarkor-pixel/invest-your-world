create type public.app_role as enum ('admin','user');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text, phone text, country text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null, unique(user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id and role=_role) $$;

create policy "own profile read" on public.profiles for select to authenticated using (id=auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "own profile update" on public.profiles for update to authenticated using (id=auth.uid());
create policy "own profile insert" on public.profiles for insert to authenticated with check (id=auth.uid());
create policy "own roles read" on public.user_roles for select to authenticated using (user_id=auth.uid());

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id, full_name) values (new.id, new.raw_user_meta_data->>'full_name');
  insert into public.user_roles(user_id, role) values (new.id,'user');
  if (select count(*) from public.user_roles where role='admin') = 0 then
    insert into public.user_roles(user_id, role) values (new.id,'admin');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.stocks (
  id uuid primary key default gen_random_uuid(),
  symbol text not null unique, name_en text not null, name_ar text not null,
  exchange text not null, sector text not null, price numeric not null,
  change_pct numeric not null default 0, dividend_yield numeric not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.stocks to authenticated, anon;
grant all on public.stocks to service_role;
alter table public.stocks enable row level security;
create policy "stocks public read" on public.stocks for select to anon, authenticated using (true);
create policy "stocks admin write" on public.stocks for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
grant insert, update, delete on public.stocks to authenticated;

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  title_en text not null, title_ar text not null, city_en text not null, city_ar text not null,
  property_type text not null, image_url text not null,
  total_value numeric not null, min_investment numeric not null default 500,
  annual_yield numeric not null, funded numeric not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.properties to authenticated, anon;
grant insert, update, delete on public.properties to authenticated;
grant all on public.properties to service_role;
alter table public.properties enable row level security;
create policy "props public read" on public.properties for select to anon, authenticated using (true);
create policy "props admin write" on public.properties for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  asset_type text not null check (asset_type in ('stock','property')),
  stock_id uuid references public.stocks(id),
  property_id uuid references public.properties(id),
  amount numeric not null check (amount > 0),
  units numeric not null default 0,
  status text not null default 'pending' check (status in ('pending','active','rejected')),
  created_at timestamptz not null default now()
);
grant select, insert on public.investments to authenticated;
grant all on public.investments to service_role;
alter table public.investments enable row level security;
create policy "inv own read" on public.investments for select to authenticated using (user_id=auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "inv own insert" on public.investments for insert to authenticated with check (user_id=auth.uid() and status='pending');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  investment_id uuid not null references public.investments(id) on delete cascade,
  currency text not null check (currency in ('USDT','BTC')),
  network text not null,
  amount_usd numeric not null,
  tx_hash text not null,
  status text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  admin_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
grant select, insert on public.payments to authenticated;
grant all on public.payments to service_role;
alter table public.payments enable row level security;
create policy "pay own read" on public.payments for select to authenticated using (user_id=auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "pay own insert" on public.payments for insert to authenticated with check (user_id=auth.uid() and status='pending');

create or replace function public.review_payment(_payment_id uuid, _approve boolean, _note text default null)
returns void language plpgsql security definer set search_path=public as $$
declare p public.payments; i public.investments;
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Forbidden'; end if;
  select * into p from public.payments where id=_payment_id for update;
  if p.status <> 'pending' then raise exception 'Already reviewed'; end if;
  update public.payments set status = case when _approve then 'confirmed' else 'rejected' end,
    admin_note=_note, reviewed_at=now() where id=_payment_id;
  update public.investments set status = case when _approve then 'active' else 'rejected' end
    where id=p.investment_id returning * into i;
  if _approve and i.property_id is not null then
    update public.properties set funded = funded + i.amount where id=i.property_id;
  end if;
end $$;
grant execute on function public.review_payment(uuid, boolean, text) to authenticated;

insert into public.stocks(symbol,name_en,name_ar,exchange,sector,price,change_pct,dividend_yield) values
('AAPL','Apple Inc.','أبل','NASDAQ','Technology',228.4,1.2,0.44),
('MSFT','Microsoft','مايكروسوفت','NASDAQ','Technology',431.1,0.8,0.72),
('NVDA','NVIDIA','إنفيديا','NASDAQ','Technology',131.6,-1.4,0.03),
('JNJ','Johnson & Johnson','جونسون آند جونسون','NYSE','Healthcare',158.2,0.3,3.1),
('KO','Coca-Cola','كوكا كولا','NYSE','Consumer',69.8,-0.2,2.9),
('EMAAR','Emaar Properties','إعمار العقارية','DFM','Real Estate',9.12,1.9,4.4),
('FAB','First Abu Dhabi Bank','بنك أبوظبي الأول','ADX','Financials',14.6,0.5,5.2),
('ADNOCDIST','ADNOC Distribution','أدنوك للتوزيع','ADX','Energy',3.71,-0.6,5.6);

insert into public.properties(title_en,title_ar,city_en,city_ar,property_type,image_url,total_value,min_investment,annual_yield,funded) values
('Marina Skyline Residence','مساكن مارينا سكاي لاين','Dubai Marina','دبي مارينا','Residential','https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=1200',2400000,500,7.8,1560000),
('Downtown Boulevard Suites','أجنحة داون تاون بوليفارد','Downtown Dubai','وسط دبي','Residential','https://images.unsplash.com/photo-1518684079-3c830dcef090?w=1200',3100000,1000,6.9,920000),
('Saadiyat Beach Villa','فيلا شاطئ السعديات','Abu Dhabi','أبوظبي','Villa','https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1200',5200000,2500,6.2,3900000),
('Business Bay Office Tower','برج مكاتب الخليج التجاري','Business Bay','الخليج التجاري','Commercial','https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200',8700000,1000,8.4,2100000);