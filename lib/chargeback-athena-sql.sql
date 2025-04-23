WITH record_count AS (
    SELECT
        cs_uri_stem,
        CASE 
            WHEN SUBSTRING(x_edge_location, 1, 3) IN ('IAD', 'CMH', 'SFO', 'PDX', 'SEA', 'DEN', 'PHX', 'DFW', 'ORD', 'ATL', 'MIA', 'EWR', 'BOS', 'MDW', 'LAS', 'LAX', 'PHL', 'PIT') THEN 'United States'
            WHEN SUBSTRING(x_edge_location, 1, 3) = 'MEX' THEN 'Mexico'
            WHEN SUBSTRING(x_edge_location, 1, 3) IN ('YUL', 'YYZ', 'YVR', 'YXU') THEN 'Canada'
            WHEN SUBSTRING(x_edge_location, 1, 3) IN ('FRA', 'STO', 'MIL', 'DUB', 'LON', 'PAR', 'VIE', 'ZRH', 'LHR', 'CDG', 'AMS', 'ARN', 'CPH', 'LIS', 'MAD', 'MXP') THEN 'Europe'
            WHEN SUBSTRING(x_edge_location, 1, 3) IN ('DXB', 'BAH', 'RUH', 'KWI') THEN 'Middle East'
            WHEN SUBSTRING(x_edge_location, 1, 3) IN ('CPT', 'JNB') THEN 'South Africa'
            WHEN SUBSTRING(x_edge_location, 1, 3) IN ('GRU', 'BOG', 'LIM', 'SCL') THEN 'South America'
            WHEN SUBSTRING(x_edge_location, 1, 3) IN ('NRT', 'OSA', 'HND') THEN 'Japan'
            WHEN SUBSTRING(x_edge_location, 1, 3) = 'SYD' THEN 'Australia'
            WHEN SUBSTRING(x_edge_location, 1, 3) IN ('SIN', 'JKT', 'HKG', 'SEL', 'TPE', 'KUL', 'BKK', 'ICN', 'PNQ', 'HIO') THEN 'Asia'
            WHEN SUBSTRING(x_edge_location, 1, 3) IN ('MUM', 'BOM', 'DEL', 'MAA', 'BLR', 'HYD') THEN 'India'
            ELSE 'Unknown'
        END AS region,
        date,
        COUNT(*) as total_requests,
        SUM(CASE WHEN cs_method IN ('DELETE', 'OPTIONS', 'PATCH', 'POST', 'PUT') THEN 1 ELSE 0 END) AS proxy_requests,
        SUM(CASE WHEN x_edge_result_type IN ('FunctionGeneratedResponse', 'FunctionExecutionError', 'FunctionThrottledError') THEN 1 ELSE 0 END) AS cloudfront_function_requests,
        SUM(CASE WHEN x_edge_result_type IN ('LambdaGeneratedResponse', 'LambdaExecutionError', 'LambdaThrottledError') THEN 1 ELSE 0 END) AS lambda_edge_requests,
        SUM(sc_bytes) as total_bytes,
        SUM(CASE WHEN cs_method IN ('DELETE', 'OPTIONS', 'PATCH', 'POST', 'PUT') THEN cs_bytes ELSE 0 END) AS proxy_bytes
    FROM "chargeback_database"."cf-logs-table"
    GROUP BY 
        cs_uri_stem, 
        SUBSTRING(x_edge_location, 1, 3), 
        date
)
SELECT
    cs_uri_stem as "URI Stem",
    region as "Region",
    total_requests as "Total Requests",
    date as "Date",
    total_bytes / power(2, 30) as "Data Transfer Out in GB",
    
    -- Data Transfer Out Cost
    CASE
        WHEN region IN ('United States', 'Mexico', 'Canada', 'Europe') THEN cast(total_bytes / power(2, 30) * 0.085 as decimal(10,8))
        WHEN region IN ('South Africa', 'Middle East', 'South America') THEN cast(total_bytes / power(2, 30) * 0.110 as decimal(10,8))
        WHEN region IN ('Japan', 'Australia') THEN cast(total_bytes / power(2, 30) * 0.114 as decimal(10,8))
        WHEN region = 'Asia' THEN cast(total_bytes / power(2, 30) * 0.120 as decimal(10,8))
        WHEN region = 'India' THEN cast(total_bytes / power(2, 30) * 0.109 as decimal(10,8))
        ELSE cast(total_bytes / power(2, 30) * 0.110 as decimal(10,8))
    END AS "Data Transfer Out Cost",
    
    -- Request Cost
    (total_requests / 10000) * 
    CASE
        WHEN region IN ('United States', 'Mexico', 'Canada') THEN 0.01
        WHEN region = 'South America' THEN 0.022
        WHEN region = 'Australia' THEN 0.0125
        ELSE 0.012
    END AS "Request Cost",
    
    proxy_requests AS "Proxy Requests",
    proxy_bytes AS "Proxy Bytes",
    
    -- Total Proxy Byte Cost
    CASE
        WHEN region IN ('United States', 'Mexico', 'Canada', 'Europe') THEN cast(proxy_bytes / power(2, 30) * 0.085 as decimal(10,8))
        WHEN region IN ('South Africa', 'Middle East', 'South America') THEN cast(proxy_bytes / power(2, 30) * 0.110 as decimal(10,8))
        WHEN region IN ('Japan', 'Australia') THEN cast(proxy_bytes / power(2, 30) * 0.114 as decimal(10,8))
        WHEN region = 'Asia' THEN cast(proxy_bytes / power(2, 30) * 0.120 as decimal(10,8))
        WHEN region = 'India' THEN cast(proxy_bytes / power(2, 30) * 0.109 as decimal(10,8))
        ELSE cast(proxy_bytes / power(2, 30) * 0.110 as decimal(10,8))
    END AS "Total Proxy Byte Cost",
    
    cloudfront_function_requests AS "CloudFront Function Requests",
    cloudfront_function_requests * 0.0000001 AS "CloudFront Function Cost",
    
    lambda_edge_requests AS "Lambda@Edge Requests",
    lambda_edge_requests * 0.0000006 AS "Lambda@Edge Request Cost",
    lambda_edge_requests * 0.005 AS "Lambda@Edge GB/sec",
    lambda_edge_requests * 0.005 * 0.00005001 AS "Lambda@Edge GB/sec cost",
    lambda_edge_requests * (0.0000006 + 0.005 * 0.00005001) AS "Total Lambda@Edge Cost",
    
    -- Total Cost
    (
        -- Data Transfer Out Cost
        CASE
            WHEN region IN ('United States', 'Mexico', 'Canada', 'Europe') THEN cast(total_bytes / power(2, 30) * 0.085 as decimal(10,8))
            WHEN region IN ('South Africa', 'Middle East', 'South America') THEN cast(total_bytes / power(2, 30) * 0.110 as decimal(10,8))
            WHEN region IN ('Japan', 'Australia') THEN cast(total_bytes / power(2, 30) * 0.114 as decimal(10,8))
            WHEN region = 'Asia' THEN cast(total_bytes / power(2, 30) * 0.120 as decimal(10,8))
            WHEN region = 'India' THEN cast(total_bytes / power(2, 30) * 0.109 as decimal(10,8))
            ELSE cast(total_bytes / power(2, 30) * 0.110 as decimal(10,8))
        END +
        
        -- Request Cost
        (total_requests / 10000) * 
        CASE
            WHEN region IN ('United States', 'Mexico', 'Canada') THEN 0.01
            WHEN region = 'South America' THEN 0.022
            WHEN region = 'Australia' THEN 0.0125
            ELSE 0.012
        END +
        
        -- Total Proxy Byte Cost
        CASE
            WHEN region IN ('United States', 'Mexico', 'Canada', 'Europe') THEN cast(proxy_bytes / power(2, 30) * 0.085 as decimal(10,8))
            WHEN region IN ('South Africa', 'Middle East', 'South America') THEN cast(proxy_bytes / power(2, 30) * 0.110 as decimal(10,8))
            WHEN region IN ('Japan', 'Australia') THEN cast(proxy_bytes / power(2, 30) * 0.114 as decimal(10,8))
            WHEN region = 'Asia' THEN cast(proxy_bytes / power(2, 30) * 0.120 as decimal(10,8))
            WHEN region = 'India' THEN cast(proxy_bytes / power(2, 30) * 0.109 as decimal(10,8))
            ELSE cast(proxy_bytes / power(2, 30) * 0.110 as decimal(10,8))
        END +
        
        -- CloudFront Function Cost
        cloudfront_function_requests * 0.0000001 +
        
        -- Total Lambda@Edge Cost
        lambda_edge_requests * (0.0000006 + 0.005 * 0.00005001)
    ) AS "Total Cost"
FROM record_count