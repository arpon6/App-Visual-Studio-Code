-- Las pizarras ABP identifican cada plan por su titulo. Esta migracion elimina
-- duplicados heredados y permite usar upsert atomico al guardarlas.

begin;

delete from match_plans
where id in (
  select id
  from (
    select
      id,
      row_number() over (
        partition by title
        order by created_at desc nulls last, id desc
      ) as row_number
    from match_plans
  ) as ranked
  where ranked.row_number > 1
);

alter table match_plans
  add constraint match_plans_title_key unique (title);

commit;