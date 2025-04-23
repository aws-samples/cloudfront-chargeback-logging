--
-- Cache hit ratio and count by day and behavior
--

SELECT
    cs_uri_stem,
    date AS log_date,
    SUM(CASE WHEN x_edge_response_result_type IN ('Hit', 'PartialHit') THEN 1 ELSE 0 END) AS cache_hits,
    SUM(CASE WHEN x_edge_response_result_type NOT IN ('Hit', 'PartialHit') THEN 1 ELSE 0 END) AS cache_misses,
    ROUND(SUM(CASE WHEN x_edge_response_result_type IN ('Hit', 'PartialHit') THEN 1 ELSE 0 END) * 100.0 /
          (SUM(CASE WHEN x_edge_response_result_type IN ('Hit', 'PartialHit') THEN 1 ELSE 0 END) +
           SUM(CASE WHEN x_edge_response_result_type NOT IN ('Hit', 'PartialHit') THEN 1 ELSE 0 END)), 2) AS cache_hit_ratio
FROM
    "chargeback_database"."cf-logs-table"
GROUP BY
    cs_uri_stem,
    date
ORDER BY
    cs_uri_stem,
    log_date;

-- URI stem error count by behavior
SELECT
    cs_uri_stem,
    sc_status,
    COUNT(*) AS count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (PARTITION BY cs_uri_stem), 2) AS percentage
FROM
    "chargeback_database"."cf-logs-table"
GROUP BY
    cs_uri_stem,
    sc_status
ORDER BY
    cs_uri_stem,
    count DESC;