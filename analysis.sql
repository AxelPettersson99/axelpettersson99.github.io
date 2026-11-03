-- Are Swedish consumer borrowers paying for rates that have already fallen?
-- Axel Pettersson, November 2026
-- Data: SCB Finansmarknadsstatistik
--   RantaT03N            lending rates to households by purpose, outstanding vs new/renegotiated contracts (monthly)
--   FM5001Nodlidande     loans and non-performing loans by purpose (quarterly)
-- Run with DuckDB.

-- 1. Load -------------------------------------------------------------------
CREATE OR REPLACE TABLE rates AS
SELECT contract,                                   -- 'outstanding' | 'new'
       purpose,                                    -- 'consumer'    | 'mortgage'
       make_date(substr(month, 1, 4)::INT, substr(month, 6, 2)::INT, 1) AS m,
       rate_pct
FROM read_csv('scb_household_lending_rates.csv', header = true);

CREATE OR REPLACE TABLE loans AS
SELECT purpose,
       substr(quarter, 1, 4)::INT AS y,
       substr(quarter, 6, 1)::INT AS q,
       stock_mnkr, npl_mnkr, npl_pct
FROM read_csv('scb_household_loans_npl.csv', header = true);

-- 2. One row per month ------------------------------------------------------
CREATE OR REPLACE VIEW monthly AS
SELECT m,
       max(rate_pct) FILTER (WHERE purpose = 'consumer' AND contract = 'outstanding') AS consumer_outstanding,
       max(rate_pct) FILTER (WHERE purpose = 'consumer' AND contract = 'new')         AS consumer_new,
       max(rate_pct) FILTER (WHERE purpose = 'mortgage' AND contract = 'outstanding') AS mortgage_outstanding,
       max(rate_pct) FILTER (WHERE purpose = 'mortgage' AND contract = 'new')         AS mortgage_new
FROM rates
GROUP BY m;

-- 3. The repricing gap: what existing consumer borrowers pay above new loans --
CREATE OR REPLACE VIEW gap AS
SELECT m,
       consumer_outstanding,
       consumer_new,
       consumer_outstanding - consumer_new AS gap_pp,
       mortgage_new
FROM monthly;

-- 3a. Gap by period
SELECT CASE
         WHEN m <  DATE '2009-09-01' THEN '2005-09 to 2009-08 (incl. 2008 rate cuts)'
         WHEN m <  DATE '2023-01-01' THEN '2009-09 to 2022-12'
         WHEN m <  DATE '2025-01-01' THEN '2023-01 to 2024-12'
         ELSE                             '2025-01 to latest'
       END                         AS period,
       round(avg(gap_pp), 2)       AS avg_gap_pp,
       round(max(gap_pp), 2)       AS max_gap_pp,
       count(*)                    AS months
FROM gap
GROUP BY ALL
ORDER BY min(m);

-- 3b. Highest gap ever, and latest month
SELECT arg_max(m, gap_pp) AS month_of_max, round(max(gap_pp), 2) AS max_gap_pp FROM gap;
SELECT m, consumer_outstanding, consumer_new, round(gap_pp, 2) AS gap_pp FROM gap ORDER BY m DESC LIMIT 1;

-- 3c. How far rates have fallen from the late-2023 peak
SELECT round(max(mortgage_new)         FILTER (WHERE m >= DATE '2023-01-01')
           - arg_max(mortgage_new, m), 2)          AS mortgage_new_fall_pp,
       round(max(consumer_new)         FILTER (WHERE m >= DATE '2023-01-01')
           - arg_max(consumer_new, m), 2)          AS consumer_new_fall_pp,
       round(max(consumer_outstanding) FILTER (WHERE m >= DATE '2023-01-01')
           - arg_max(consumer_outstanding, m), 2)  AS consumer_outstanding_fall_pp
FROM monthly;

-- 4. Size of the gap in SEK -------------------------------------------------
--    avg gap since Jan 2025 x latest outstanding consumer credit stock.
--    A rough upper bound on what existing borrowers pay above today's new-loan rates per year.
SELECT round((SELECT avg(gap_pp) FROM gap WHERE m >= DATE '2025-01-01'), 2)              AS avg_gap_pp_2025_on,
       (SELECT arg_max(stock_mnkr, y * 10 + q) FROM loans WHERE purpose = 'consumer')   AS consumer_stock_mnkr,
       round((SELECT avg(gap_pp) FROM gap WHERE m >= DATE '2025-01-01') / 100
           * (SELECT arg_max(stock_mnkr, y * 10 + q) FROM loans WHERE purpose = 'consumer') / 1000, 1)
                                                                                         AS extra_interest_bn_sek_per_year;

-- 5. Credit quality ---------------------------------------------------------
SELECT purpose, y, q, stock_mnkr, npl_pct
FROM loans
WHERE purpose IN ('consumer', 'mortgage')
  AND (y, q) IN ((2019, 4), (2023, 4), (2026, 2))
ORDER BY purpose, y, q;

-- 6. Sanity check: one-month jumps in the consumer series (possible reporting breaks)
SELECT m,
       round(consumer_new - lag(consumer_new) OVER (ORDER BY m), 2)                 AS consumer_new_change_pp,
       round(mortgage_new - lag(mortgage_new) OVER (ORDER BY m), 2)                 AS mortgage_new_change_pp
FROM monthly
QUALIFY abs(consumer_new - lag(consumer_new) OVER (ORDER BY m)) > 1
ORDER BY m;
