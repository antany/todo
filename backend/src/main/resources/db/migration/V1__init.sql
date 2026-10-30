-- One global sequence stamps every write; clients use it as the pull cursor.
create sequence change_seq;

create table app_user (
    id           uuid primary key,
    google_sub   text unique,            -- null = placeholder for someone invited before first sign-in
    email        text not null,
    display_name text not null,
    created_at   timestamptz not null default now()
);
create unique index app_user_email_lower on app_user (lower(email));

create table todo_list (
    id         uuid primary key,
    owner_id   uuid not null references app_user (id),
    name       text not null,
    color      text,
    icon       text,
    position   double precision not null default 0,
    archived   boolean not null default false,
    deleted    boolean not null default false,
    updated_at timestamptz not null,
    seq        bigint not null default nextval('change_seq')
);
create index todo_list_owner on todo_list (owner_id);
create index todo_list_seq on todo_list (seq);

create table list_member (
    list_id    uuid not null references todo_list (id) on delete cascade,
    user_id    uuid not null references app_user (id),
    role       text not null check (role in ('EDITOR', 'VIEWER')),
    status     text not null check (status in ('PENDING', 'ACCEPTED')),
    invited_by uuid not null references app_user (id),
    primary key (list_id, user_id)
);
create index list_member_user on list_member (user_id);

create table task (
    id            uuid primary key,
    list_id       uuid not null references todo_list (id) on delete cascade,
    title         text not null,
    notes         text not null default '',
    priority      smallint not null default 0 check (priority between 0 and 3),
    due_at        timestamptz,
    follow_up_at  timestamptz,
    remind_at     timestamptz,
    repeat_rule   text not null default 'NONE' check (repeat_rule in ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY')),
    status        text not null default 'TODO' check (status in ('TODO', 'IN_PROGRESS', 'WAITING', 'DONE')),
    completed_at  timestamptz,
    position      double precision not null default 0,
    tags          text[] not null default '{}',
    deleted       boolean not null default false,
    updated_at    timestamptz not null,
    updated_by    uuid references app_user (id),
    seq           bigint not null default nextval('change_seq')
);
create index task_list on task (list_id);
create index task_seq on task (seq);

create table subtask (
    id         uuid primary key,
    task_id    uuid not null references task (id) on delete cascade,
    title      text not null,
    done       boolean not null default false,
    position   double precision not null default 0,
    deleted    boolean not null default false,
    updated_at timestamptz not null,
    seq        bigint not null default nextval('change_seq')
);
create index subtask_task on subtask (task_id);
create index subtask_seq on subtask (seq);

-- Append-only; merges by union on id.
create table task_activity (
    id       uuid primary key,
    task_id  uuid not null references task (id) on delete cascade,
    actor_id uuid references app_user (id),
    kind     text not null,
    detail   jsonb not null default '{}',
    at       timestamptz not null,
    seq      bigint not null default nextval('change_seq')
);
create index task_activity_task on task_activity (task_id);
create index task_activity_seq on task_activity (seq);
