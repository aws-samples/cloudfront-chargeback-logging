# Amazon CloudFront behavior-based cost charge-back logging

The solution uses Amazon CloudFront to “charge-back” or allocate/identify CDN costs at a more granular level to better track spend by origin or behavior.

## Solution Architecture



## Requirements

- Node.js 18.x
- AWS CDK 2.59.x
- Configured AWS credentials


## Deploy on AWS

1. Clone git repository and navigate to CDK project


```bash
git clone https://github.com/aws-samples/aws-cloudfront-charge-back-logging.git
cd aws-cloudfront-charge-back-logging
```

2. Install CDK

```bash
npm install
```

3. Run CDK commands to bootstrap and synthesize the CDK stack

```bash
cdk bootstrap
cdk synth
```




# CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `cdk deploy`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template

## Testing CDK constructs
```
npm test
```

## Destroy CDK app resources

To clean up your CDK app run the below command:
```bash
cdk destroy --all
```

Please be aware that some resources aren't automatically deleted and either 
need a retention policy that allows deletes or you need to delete them manually 
in you AWS account. Deleting Lambda@Edge might fail because the function can 
only be deleted after replicas of the function have been deleted by CloudFront.

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This sample code is licensed under the MIT-0 License. See the LICENSE file.