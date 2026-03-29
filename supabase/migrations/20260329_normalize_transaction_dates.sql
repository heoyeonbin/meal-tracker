-- Normalize legacy MM/DD transaction dates to YYYY-MM-DD.
-- Rule matches the app fallback parser:
-- - months later than the current server month are treated as previous year
-- - otherwise current year

update public.transactions
set date = to_char(
  make_date(
    case
      when split_part(date, '/', 1)::int > extract(month from current_date)::int
        then extract(year from current_date)::int - 1
      else extract(year from current_date)::int
    end,
    split_part(date, '/', 1)::int,
    split_part(date, '/', 2)::int
  ),
  'YYYY-MM-DD'
)
where date ~ '^\d{2}/\d{2}$';
