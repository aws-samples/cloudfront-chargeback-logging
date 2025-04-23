# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),


##  2025-04-07
 
### Updated
- Athena SQL to have updated fields for readability and Lambda@Edge estimates
- Project renamed from `cloudfront-charge-back-logging` to `cloudfront-chargeback-logging`
- Architecture diagram and screenshots updated
- README.md updated

##  2025-04-23
 
### Updated
- Git history sensitive data cleanup
- Update allowedmethod on distribution to show proxy byte (DTOO) data
- Seperate directory for api-gateway and L@E for clarity
- Seperate athena queries for chargeback and other use cases
- Evaluate time-taken field for L@E estimation. Finding: Lambda coldstart and overhead creates too much ambiguity and difference between the "time taken" and bill duration