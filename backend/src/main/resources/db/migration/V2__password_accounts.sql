-- Username + password accounts, an alternative to Google sign-in. No personal data: no email is required.
alter table app_user alter column email drop not null;
alter table app_user add column username text;
alter table app_user add column password_hash text;
-- usernames are stored lowercase; the unique index makes them case-insensitive anyway
create unique index app_user_username_lower on app_user (lower(username));
alter table app_user add constraint app_user_identity check (email is not null or username is not null);
