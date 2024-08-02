import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
export declare class CloudfrontCostManagementChargeBackStack extends Stack {
    readonly kinesisDataFireHoseArn: string;
    readonly loggingBucket: s3.Bucket;
    constructor(scope: Construct, id: string, props?: StackProps);
}
