create table if not exists public.import_interfaces (
  id text primary key,
  category text not null check (category in ('general', 'school')),
  adapter_key text not null,
  title text not null,
  description text not null,
  input_label text not null,
  upload_label text not null,
  placeholder text not null,
  hints jsonb not null default '[]'::jsonb,
  accepted_file_types text not null,
  enabled boolean not null default true,
  sort_order int not null default 100,
  school_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.import_interfaces enable row level security;

create policy "import_interfaces_select_all"
  on public.import_interfaces for select
  using (true);

create policy "import_interfaces_admin_insert"
  on public.import_interfaces for insert
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin'));

create policy "import_interfaces_admin_update"
  on public.import_interfaces for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin'));

create policy "import_interfaces_admin_delete"
  on public.import_interfaces for delete
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin'));

insert into public.import_interfaces (
  id, category, adapter_key, title, description, input_label, upload_label,
  placeholder, hints, accepted_file_types, enabled, sort_order, school_name
) values
  (
    'generic-text',
    'general',
    'generic-text',
    '通用文本 / AI 导入',
    '适用于 BumpFree v1、Word、Excel、HTML、CSV、手机粘贴文本或 AI 整理后的课表。',
    '课表文本',
    '上传课表文件',
    '粘贴 BumpFree v1 文本，或受支持的松散课表文本...',
    '["可以直接粘贴 BumpFree Schedule Import v1 文本，或上传 DOCX、XLSX、XLS、CSV、HTML、TXT 抽取文本。", "PDF 暂不在站内直接解析；请先用本地工具或可信 AI 转为文本，再粘贴导入。", "复杂版式如果无法直接识别，可先让 AI 整理成 v1 格式；导入前务必检查预览。", "解析预览确认前不会保存任何课程。"]'::jsonb,
    '.txt,.html,.htm,.docx,.xlsx,.xls,.csv,text/plain,text/html,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel',
    true,
    10,
    null
  ),
  (
    'xmu-html',
    'school',
    'xmu-html',
    '厦马 HTML 课表导入',
    '适用于 XMUM / 厦马教务系统导出或复制的完整 HTML 课表页。',
    '厦马 HTML',
    '拖拽或上传 HTML/TXT',
    '上传 .html/.htm，或粘贴包含 <table>...</table> 的厦马课表 HTML...',
    '["在教务系统打开周课表后，保存网页为 .html/.htm，或全选课表 HTML 内容粘贴到这里。", "系统会读取 Time 列、Monday-Sunday 列、rowspan 时长、Week 1-14、教师和教室；若 HTML 没有学期，会按当前月份推断。"]'::jsonb,
    '.html,.htm,text/html,text/plain',
    true,
    20,
    '厦门大学马来西亚分校'
  ),
  (
    'swpu-pdf',
    'school',
    'swpu-pdf-text',
    '西南石油大学课表文本导入',
    '适用于西南石油大学 timeTableForStu 课表安全转换后的文本。',
    '课表文本',
    '上传 TXT',
    '粘贴 timeTableForStu PDF 经本地工具或可信 AI 抽取后的课表文本...',
    '["出于服务端内存安全考虑，PDF 不在站内直接解析；请先在本地或可信 AI 工具中抽取为 UTF-8 文本。", "专用适配器会从文本解析课程代码、周次、星期、节次和教室。", "节次会按西南石油大学教学日历中的作息时间映射为具体开始/结束时间，预览中仍可手动调整学期信息。"]'::jsonb,
    '.txt,text/plain',
    true,
    30,
    '西南石油大学'
  )
on conflict (id) do nothing;
