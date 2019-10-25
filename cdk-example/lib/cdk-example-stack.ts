import cdk = require('@aws-cdk/core');
import lambda = require("@aws-cdk/aws-lambda");
import dynamodb = require("@aws-cdk/aws-dynamodb");
import apigateway = require("@aws-cdk/aws-apigateway");
import sqs = require('@aws-cdk/aws-sqs');
import lambdaEventSource = require("@aws-cdk/aws-lambda-event-sources");
import ecsPatterns = require("@aws-cdk/aws-ecs-patterns");
import ecs = require("@aws-cdk/aws-ecs");
import rds = require("@aws-cdk/aws-rds");
import ec2 = require("@aws-cdk/aws-ec2");
import {RemovalPolicy} from "@aws-cdk/core";
import {Watchful} from "cdk-watchful";

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

        const api = new apigateway.LambdaRestApi(this, 'storage-gateway', {
            handler: storageFunction
        });

        const queue = new sqs.Queue(this, 'storage-queue', {
            queueName: 'storage-updates'
        });

        const proxyFunction = new lambda.Function(this, 'proxy-function', {
            runtime: lambda.Runtime.NODEJS_8_10,
            code: lambda.Code.fromAsset("./lambda"),
            handler: "queue-proxy.handler",
            environment: {
                QUEUE_URL: queue.queueUrl
            }
        });
        proxyFunction.addEventSource(new lambdaEventSource.DynamoEventSource(table, {
            startingPosition: lambda.StartingPosition.TRIM_HORIZON
        }));
        queue.grantSendMessages(proxyFunction);

        const vpc = new ec2.Vpc(this, 'vpd', {});

        const dbUser = 'legacy';
        const dbPassword = 'legacyPASSWORD';

        const legacyDatabase = new rds.DatabaseInstance(this, 'legacy-database', {
            engine: rds.DatabaseInstanceEngine.POSTGRES,
            masterUsername: dbUser,
            masterUserPassword: cdk.SecretValue.plainText(dbPassword),
            instanceClass: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
            vpc: vpc,
            removalPolicy: RemovalPolicy.DESTROY, // SNAPSHOT currently not supported https://github.com/aws/aws-cdk/issues/3298,
            deletionProtection: false
        });

        const legacyQueueProcessor = new ecsPatterns.QueueProcessingFargateService(this, 'legacy-service', {
            image: ecs.AssetImage.fromAsset("./legacy-storage"),
            queue: queue,
            desiredTaskCount: 0, // this does not work currently, https://github.com/aws/aws-cdk/issues/4719
            maxScalingCapacity: 3,
            scalingSteps: [
                {upper: 0, change: -1}, //no load = no tasks
                {lower: 10, change: +1}, // < 10 waiting = 1 Task
                {lower: 50, change: +2} // add Tasks if load increases
            ],
            vpc: vpc,
            enableLogging: true,
            environment: {
                "POSTGRES_USER": dbUser,
                "POSTGRES_PASSWORD": dbPassword,
                "POSTGRES_HOST": legacyDatabase.dbInstanceEndpointAddress
            }
        });
        queue.grantConsumeMessages(legacyQueueProcessor.service.taskDefinition.taskRole);
        legacyDatabase.connections.allowFrom(legacyQueueProcessor.service, ec2.Port.tcp(5432), 'legacy service is allowed to access legacy database');

        const metrics = new Watchful(this, 'metrics', {
            alarmEmail: 'elias.draexler@viesure.io'
        });
        metrics.watchScope(this);
    }
}
