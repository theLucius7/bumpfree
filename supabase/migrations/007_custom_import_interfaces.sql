alter table public.import_interfaces
    add column if not exists custom_meta jsonb not null default '{}'::jsonb;

create index if not exists import_interfaces_category_sort_idx
    on public.import_interfaces(category, sort_order);
