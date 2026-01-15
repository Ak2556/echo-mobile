-- Let echo photo/video uploads use the project-level Storage limit.
-- Supabase still enforces the global Storage file size limit configured in the dashboard.

update storage.buckets
set file_size_limit = null
where id = 'echo-media';
