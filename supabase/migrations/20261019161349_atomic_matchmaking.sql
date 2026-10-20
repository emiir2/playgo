create or replace function public.matchmake(
  p_user_id uuid,
  p_time_control jsonb,
  p_board_size int
)
returns table(match_id uuid, player_color text, queued boolean)
language plpgsql
set search_path = public
as $$
declare
  opponent public.matchmaking_queue%rowtype;
  created_match uuid;
  black_id uuid;
  white_id uuid;
  main_ms bigint;
  empty_board jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(concat(p_board_size, ':', p_time_control::text), 0));

  select * into opponent
  from public.matchmaking_queue
  where status = 'waiting'
    and user_id <> p_user_id
    and board_size = p_board_size
    and time_control = p_time_control
  order by created_at
  for update skip locked
  limit 1;

  if opponent.id is null then
    insert into public.matchmaking_queue(user_id, time_control, board_size, status)
    values (p_user_id, p_time_control, p_board_size, 'waiting')
    on conflict (user_id) where status = 'waiting'
    do update set time_control = excluded.time_control, board_size = excluded.board_size
    returning id into opponent.id;
    return query select null::uuid, null::text, true;
    return;
  end if;

  if opponent.user_id < p_user_id then
    black_id := opponent.user_id;
    white_id := p_user_id;
  else
    black_id := p_user_id;
    white_id := opponent.user_id;
  end if;

  main_ms := greatest(0, coalesce((p_time_control ->> 'mainMinutes')::numeric, 0) * 60 * 1000)::bigint;
  empty_board := jsonb_build_array();
  for i in 1..p_board_size loop
    empty_board := empty_board || jsonb_build_array(jsonb_build_array());
    for j in 2..p_board_size loop
      empty_board := jsonb_set(empty_board, array[(i - 1)::text], (empty_board -> (i - 1)) || 'null'::jsonb);
    end loop;
  end loop;

  insert into public.matches(black_player_id, white_player_id, board, black_clock_ms, white_clock_ms, time_control)
  values (black_id, white_id, empty_board, main_ms, main_ms, p_time_control)
  returning id into created_match;

  update public.matchmaking_queue set status = 'matched' where id = opponent.id;

  return query select created_match, case when black_id = p_user_id then 'black' else 'white' end, false;
end;
$$;

revoke all on function public.matchmake(uuid, jsonb, int) from public;
grant execute on function public.matchmake(uuid, jsonb, int) to service_role;
