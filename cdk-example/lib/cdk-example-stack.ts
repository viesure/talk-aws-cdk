import cdk = require('@aws-cdk/core');
import lambda = require("@aws-cdk/aws-lambda");
import dynamodb = require("@aws-cdk/aws-dynamodb");
import apigateway = require("@aws-cdk/aws-apigateway");
import {RemovalPolicy} from "@aws-cdk/core";

export class CdkExampleStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const table = new dynamodb.Table(this, 'storage-table', {
            tableName: 'STORAGE',
            partitionKey: {name: 'TIMESTAMP', type: dynamodb.AttributeType.STRING},
            stream: dynamodb.StreamViewType.NEW_IMAGE,
            removalPolicy: RemovalPolicy.DESTROY
        });

        const storageFunction = new lambda.Function(this, 'storage-function', {
            runtime: lambda.Runtime.NODEJS_8_10,
            handler: "storage.handler",
            code: lambda.Code.fromAsset("./lambda"),
            environment: {
                TABLE_NAME: table.tableName
            }
        });

        table.grantReadWriteData(storageFunction);

    }
}
