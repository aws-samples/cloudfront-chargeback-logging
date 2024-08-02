import {
  Aws,
  CfnOutput,
  RemovalPolicy,
  Stack,
  StackProps,
  Duration,
  Lazy,
  Size,
  Fn
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';

import * as glue_alpha from '@aws-cdk/aws-glue-alpha';
import * as glue from 'aws-cdk-lib/aws-glue';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';

import * as destination from 'aws-cdk-lib/aws-logs-destinations';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as waf from 'aws-cdk-lib/aws-wafv2';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { CfnDisk } from 'aws-cdk-lib/aws-lightsail';

export class CloudfrontChargeBackLoggingStack extends Stack {
  public readonly logLandingBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    //CloudFront standard logs bucket
    const logLandingBucket = new s3.Bucket(this, 'log-landing-bucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      enforceSSL: true,
      accessControl: s3.BucketAccessControl.LOG_DELIVERY_WRITE,
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY
    });

    //WAF logs bucket and add put logs and delivery check through get bucket access-control list
    const WAFlogLandingBucket = new s3.Bucket(this, 'waf-log-landing-bucket', {
      bucketName: `aws-waf-logs-chargeback-${Aws.ACCOUNT_ID}-${Aws.REGION}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      enforceSSL: true,
      accessControl: s3.BucketAccessControl.LOG_DELIVERY_WRITE,
      // autoDeleteObjects: true,
      // removalPolicy: RemovalPolicy.DESTROY
    });
    WAFlogLandingBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        principals: [ new iam.ServicePrincipal('delivery.logs.amazonaws.com')],
        actions: ['s3:PutObject'],
        resources: [`${WAFlogLandingBucket.bucketArn}/*`],
      })
    );
    WAFlogLandingBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        principals: [ new iam.ServicePrincipal('delivery.logs.amazonaws.com')],
        actions: ['s3:GetBucketAcl'],
        resources: [`${WAFlogLandingBucket.bucketArn}`],
      })
    );

    //Bucket for hosting SPA
    const spaBucket = new s3.Bucket(this, 'spa-bucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      enforceSSL: true,
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Create access identity, and grant read access only, to use w/ CloudFront
    // Create an origin for the CloudFront distribution to reference
    const s3AccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OIA', {
        comment: "Setup access from CloudFront to the bucket ( read )",
    });
    spaBucket.grantRead(s3AccessIdentity);

    // LogGroup for aggregating logs from the Lambda@Edge function
    const logGroup = new logs.LogGroup(this, 'LambdaEdgeLogGroup', {
      logGroupName: `/aws/lambda/us-east-1.chargeBackLambdaEdge`,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const spaOrigin = new origins.S3Origin(spaBucket, {originAccessIdentity: s3AccessIdentity})

    // Creating L@E function
    const chargeback_LE = new cloudfront.experimental.EdgeFunction(this, 'ChargebackEdgeFunc', {
      runtime: lambda.Runtime.PYTHON_3_10,
      handler: 'index.handler',
      functionName: 'chargeBackLambdaEdge',
      code: lambda.Code.fromAsset(path.join('src/', 'lambda')),
      logGroup: logGroup,
    });

    //WAF for the CF distribution and logging configuration to WACL
    const cfnWebACL = new waf.CfnWebACL(this, 'ChargeBackWebAcl', {
      defaultAction: {
        allow: {}
      },
      scope: 'CLOUDFRONT',
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName:'MetricForWebACLCDK',
        sampledRequestsEnabled: true,
      },
      name: 'ChargeBackWACL',
      rules: [{
        name: 'CRSRule',
        priority: 0,
        statement: {
          managedRuleGroupStatement: {
            name:'AWSManagedRulesCommonRuleSet',
            vendorName:'AWS'
          }
        },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName:'MetricForWebACLCDK-CRS',
          sampledRequestsEnabled: true,
        },
        overrideAction: {
          none: {}
        },
      },
      {
        name: 'IPReputationRule',
        priority: 1,
        statement: {
          managedRuleGroupStatement: {
            name:'AWSManagedRulesAmazonIpReputationList',
            vendorName:'AWS'
          }
        },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName:'MetricForWebACLCDK-IPReputation',
          sampledRequestsEnabled: true,
        },
        overrideAction: {
          none: {}
        },
      },
      {
        name: 'BadInputs',
        priority: 2,
        statement: {
          managedRuleGroupStatement: {
            name:'AWSManagedRulesKnownBadInputsRuleSet',
            vendorName:'AWS'
          }
        },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName:'MetricForWebACLCDK-BadInputs',
          sampledRequestsEnabled: true,
        },
        overrideAction: {
          none: {}
        },
      },
    ],
    });

    const WACLLoggingConfiguration = new waf.CfnLoggingConfiguration(this, 'WAFLoggingConfiguration', {
      logDestinationConfigs: [`${WAFlogLandingBucket.bucketArn}`],
      resourceArn: cfnWebACL.attrArn,
    });
    WACLLoggingConfiguration.node.addDependency(cfnWebACL);

    // Cloudfront distribution with multiple origins
    const chargeBackdistribution = new cloudfront.Distribution(this, 'sample-charge-back-distribution', {
        comment: 'Charge-back sample distribution',
        defaultRootObject: 'index.html',
        webAclId: cfnWebACL.attrArn,
        defaultBehavior: {
          origin: spaOrigin,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        additionalBehaviors: {
          '/EdgeLambda.html': {
            origin: spaOrigin,
            allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
            viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            edgeLambdas: [
              {
                functionVersion: chargeback_LE.currentVersion,
                eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
              },
              {
                functionVersion: chargeback_LE.currentVersion,
                eventType: cloudfront.LambdaEdgeEventType.ORIGIN_RESPONSE,
              },
            ]
          },
        },
        logBucket: logLandingBucket,
        logFilePrefix: 'cloudfront-access-logs',
      }
    );
    

    //Lambda for serving dynamic API content
    const chargeBackLambda = new lambda.Function(this, 'apiAccessLambda', {
      functionName: 'chargeBackLambda',
      code: lambda.Code.fromAsset(path.join('src/', 'lambda')),
      handler: 'bizone.handler',
      runtime: lambda.Runtime.PYTHON_3_10,
      timeout: Duration.seconds(10),
    });

    //API Gateway for dynamic content endpoint 
    const chargeBackAPI = new apigateway.LambdaRestApi(this, 'MyApi', {
      restApiName: 'ChargeBackAPI',
      handler: chargeBackLambda,
      deployOptions: {
        stageName: 'stage',
      },
      endpointTypes: [apigateway.EndpointType.REGIONAL],
    });

    //Adding API Gateway endpoint to the CloudFront behaviors and only allowing
    //traffic from the distribution
    chargeBackdistribution.addBehavior('/api/*', new origins.RestApiOrigin(chargeBackAPI), {
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    });
    
    //Deploying SPAs
    new s3deploy.BucketDeployment(this, 'deploy-webpage', {
      sources: [s3deploy.Source.asset('./webpages')],
      destinationBucket: spaBucket,
      distribution: chargeBackdistribution,
      distributionPaths: ['/*'],
    });

    // Adding CloudFront Function and behavior to the distribution
    const chargeback_CFF = new cloudfront.Function(this, 'Function', {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(" \
      function handler(event) { \
        const request = event.request; \
        const headers = request.headers; \
        const host = request.headers.host.value; \
        return { \
            statusCode: 302, \
            statusDescription: 'Found', \
            headers: { \
                'cloudfront-functions': { value: 'generated-by-CloudFront-Functions' }, \
                'location': { value: '/secondBusiness.html' } \
            } \
        }; \
    }" 
    )});

    chargeBackdistribution.addBehavior('/EdgeFunc.html', spaOrigin, {
      allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      functionAssociations: [{
        function: chargeback_CFF,
        eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
      }]
    });

    // Creating Glue Database
    const logDatabase = new glue_alpha.Database(this, 'MyDatabase', {
      databaseName: 'chargeback_database',
    });

    // Creating Glue IAM Role
    const glueRole = new iam.Role(this, 'glueRole', {
      assumedBy: new iam.ServicePrincipal('glue.amazonaws.com'),
      // add inline policy to encrypt logs
      inlinePolicies: {
        SecurityConfig: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                "logs:AssociateKmsKey"
              ],
              resources: [
                `arn:aws:logs:${Aws.REGION}:${Aws.ACCOUNT_ID}:log-group:/aws-glue/crawlers-role/*`
              ],
            })
          ]
        })
      }
    });
    glueRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSGlueServiceRole"));
    logLandingBucket.grantRead(glueRole);

    const logBucket = new s3.Bucket(this, 'CloudFrontLogs', {
      // ACL, required by CloudFront
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
      // Make sure we don't keep unnecessary data after we delete this stack
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });

    //CF Standard Log table
    // https://docs.aws.amazon.com/athena/latest/ug/cloudfront-logs.html#create-cloudfront-table-standard-logs
    const CFlogTableTest = new glue.CfnTable(this, 'CFLogTableTest', {
      catalogId: Stack.of(this).account, // Replace with your AWS Account ID if necessary
      databaseName: logDatabase.databaseName,
      tableInput: {
        name: 'cf-logs-table',
        description: 'CloudFront Log Table',
        tableType: 'EXTERNAL_TABLE',
        parameters: {
          'skip.header.line.count': '2',
          // 'separatorChar': '\t',
        },
        storageDescriptor: {
          columns: [
            { name: 'date', type: 'date' },
            { name: 'time', type: 'string' },
            { name: 'x_edge_location', type: 'string' },
            { name: 'sc_bytes', type: 'bigint' },
            { name: 'c_ip', type: 'string' },
            { name: 'cs_method', type: 'string' },
            { name: 'cs_host', type: 'string' },
            { name: 'cs_uri_stem', type: 'string' },
            { name: 'sc_status', type: 'int' },
            { name: 'cs_referrer', type: 'string' },
            { name: 'cs_user_agent', type: 'string' },    
            { name: 'cs_uri_query', type: 'string' },    
            { name: 'cs_cookie', type: 'string' },    
            { name: 'x_edge_result_type', type: 'string' },    
            { name: 'x_edge_request_id', type: 'string' },    
            { name: 'x_host_header', type: 'string' },    
            { name: 'cs_protocol', type: 'string' },    
            { name: 'cs_bytes', type: 'bigint' },    
            { name: 'time_taken', type: 'float' },    
            { name: 'x_forwarded_for', type: 'string' },    
            { name: 'ssl_protocol', type: 'string' },    
            { name: 'ssl_cipher', type: 'string' },    
            { name: 'x_edge_response_result_type', type: 'string' },    
            { name: 'cs_protocol_version', type: 'string' },    
            { name: 'fle_status', type: 'string' },    
            { name: 'fle_encrypted_fields', type: 'int' },    
            { name: 'c_port', type: 'int' },    
            { name: 'time_to_first_byte', type: 'float' },    
            { name: 'x_edge_detailed_result_type', type: 'string' },    
            { name: 'sc_content_type', type: 'string' },    
            { name: 'sc_content_len', type: 'bigint' },    
            { name: 'sc_range_start', type: 'bigint' },    
            { name: 'sc_range_end', type: 'bigint' },    
          ],
          location: `s3://${logLandingBucket.bucketName}/cloudfront-access-logs`,      
          inputFormat: 'org.apache.hadoop.mapred.TextInputFormat',
          outputFormat: 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat',
          serdeInfo: {
            serializationLibrary: 'org.apache.hadoop.hive.serde2.lazy.LazySimpleSerDe',
            parameters: {
              'serialization.format' : '\t',
              'field.delim': '\t'
            }
          },
        },
      },
    });

    //WAF Log table
    //Goodness gracious this is f***in complex
    // https://docs.aws.amazon.com/athena/latest/ug/waf-logs.html
    // Cost optimization and Query optimization calls for better partitioning
    const WAFlogTable = new glue.CfnTable(this, 'WAFLogTable', {
      catalogId: Stack.of(this).account, // Replace with your AWS Account ID if necessary    
      databaseName: logDatabase.databaseName,    
      tableInput: {    
        name: 'waf-log-table',    
        description: 'WAF Log Table',    
        tableType: 'EXTERNAL_TABLE',    
        parameters: {},    
        storageDescriptor: {    
          columns: [    
            { name: 'timestamp', type: 'bigint' },    
            { name: 'formatversion', type: 'int' },    
            { name: 'webaclid', type: 'string' },    
            { name: 'terminatingruleid', type: 'string' },    
            { name: 'terminatingruletype', type: 'string' },    
            { name: 'action', type: 'string' },    
            {    
              name: 'terminatingrulematchdetails',    
              type: 'array<struct<conditiontype:string,sensitivitylevel:string,location:string,matcheddata:array<string>>>',    
            },    
            { name: 'httpsourcename', type: 'string' },    
            { name: 'httpsourceid', type: 'string' },    
            {    
              name: 'rulegrouplist',    
              type: 'array<struct<rulegroupid:string,terminatingrule:struct<ruleid:string,action:string,rulematchdetails:array<struct<conditiontype:string,sensitivitylevel:string,location:string,matcheddata:array<string>>>>,nonterminatingmatchingrules:array<struct<ruleid:string,action:string,overriddenaction:string,rulematchdetails:array<struct<conditiontype:string,sensitivitylevel:string,location:string,matcheddata:array<string>>>,challengeresponse:struct<responsecode:string,solvetimestamp:string>,captcharesponse:struct<responsecode:string,solvetimestamp:string>>>,excludedrules:string>>',    
            },    
            {    
              name: 'ratebasedrulelist',    
              type: 'array<struct<ratebasedruleid:string,limitkey:string,maxrateallowed:int>>',    
            },    
            {    
              name: 'nonterminatingmatchingrules',    
              type: 'array<struct<ruleid:string,action:string,rulematchdetails:array<struct<conditiontype:string,sensitivitylevel:string,location:string,matcheddata:array<string>>>,challengeresponse:struct<responsecode:string,solvetimestamp:string>,captcharesponse:struct<responsecode:string,solvetimestamp:string>>>',    
            },    
            {    
              name: 'requestheadersinserted',    
              type: 'array<struct<name:string,value:string>>',    
            },    
            { name: 'responsecodesent', type: 'string' },    
            {    
              name: 'httprequest',    
              type: 'struct<clientip:string,country:string,headers:array<struct<name:string,value:string>>,uri:string,args:string,httpversion:string,httpmethod:string,requestid:string>',    
            },    
            { name: 'labels', type: 'array<struct<name:string>>' },    
            {    
              name: 'captcharesponse',    
              type: 'struct<responsecode:string,solvetimestamp:string,failureReason:string>',    
            },    
            {    
              name: 'challengeresponse',    
              type: 'struct<responsecode:string,solvetimestamp:string,failureReason:string>',    
            },    
            { name: 'ja3Fingerprint', type: 'string' },    
          ],    
          location: `s3://${WAFlogLandingBucket.bucketName}/AWSLogs/`,    
          inputFormat: 'org.apache.hadoop.mapred.TextInputFormat',    
          outputFormat: 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat',    
          serdeInfo: {    
            serializationLibrary: 'org.openx.data.jsonserde.JsonSerDe',
            parameters: {
              'serialization.format' : '1'
            }   
          },    
        },    
      },    
    });

    new CfnOutput(this, 'cloudFrontUrl', { 
      value: chargeBackdistribution.distributionDomainName 
    }); 

}};