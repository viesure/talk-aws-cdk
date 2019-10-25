import cdk = require('@aws-cdk/core');
import lambda = require("@aws-cdk/aws-lambda");


export class CdkExampleStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const storageFunction = new lambda.Function(this, 'cool-function', {
            runtime: lambda.Runtime.NODEJS_8_10,
            handler: "storage.handler",
            code: lambda.Code.fromAsset("./lambda")
        });

    }
}
