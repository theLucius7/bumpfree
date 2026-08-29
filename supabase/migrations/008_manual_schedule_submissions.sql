create table if not exists public.manual_schedule_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'rejected')),
  text_content text,
  file_name text,
  file_type text,
  file_size int,
  file_data text,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.manual_schedule_submissions enable row level security;

do $$ begin
  create policy "manual_schedule_submissions_insert_own"
    on public.manual_schedule_submissions for insert
    with check (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "manual_schedule_submissions_select_own_or_admin"
    on public.manual_schedule_submissions for select
    using (
      auth.uid() = user_id
      or exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin')
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "manual_schedule_submissions_admin_update"
    on public.manual_schedule_submissions for update
    using (exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin'));
exception when duplicate_object then null;
end $$;

create index if not exists manual_schedule_submissions_status_created_idx
  on public.manual_schedule_submissions(status, created_at desc);

create index if not exists manual_schedule_submissions_user_created_idx
  on public.manual_schedule_submissions(user_id, created_at desc);

create index if not exists manual_schedule_submissions_user_status_idx
  on public.manual_schedule_submissions(user_id, status);

insert into public.import_interfaces (
  id, category, adapter_key, title, description, input_label, upload_label,
  placeholder, hints, accepted_file_types, enabled, sort_order, school_name, custom_meta
) values (
  'manual-review',
  'general',
  'manual-review',
  '人工处理',
  '自动解析失败时，可以提交课表文本或图片，由管理员在后台处理。',
  '课表文本或说明',
  '上传图片/TXT',
  '粘贴原始课表文本，或简单说明图片来源、学期、学校等信息...',
  '["适合自动解析失败、只有截图、格式不稳定或需要人工确认的课表。", "提交后不会立即导入课程，管理员会在后台待处理列表中查看并处理。"]'::jsonb,
  '.txt,.html,.htm,.png,.jpg,.jpeg,.webp,text/plain,text/html,image/png,image/jpeg,image/webp',
  true,
  15,
  null,
  '{}'::jsonb
) on conflict (id) do update set
  category = excluded.category,
  adapter_key = excluded.adapter_key,
  title = excluded.title,
  description = excluded.description,
  input_label = excluded.input_label,
  upload_label = excluded.upload_label,
  placeholder = excluded.placeholder,
  hints = excluded.hints,
  accepted_file_types = excluded.accepted_file_types,
  sort_order = excluded.sort_order,
  updated_at = now();
