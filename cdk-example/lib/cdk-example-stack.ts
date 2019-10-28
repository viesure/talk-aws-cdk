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
import certManager = require("@aws-cdk/aws-certificatemanager");
import AWS = require("aws-sdk");
import route53 = require("@aws-cdk/aws-route53");
import route53_targets = require("@aws-cdk/aws-route53-targets");
import {RemovalPolicy} from "@aws-cdk/core";
import {Watchful} from "cdk-watchful";
import {IHostedZone} from "@aws-cdk/aws-route53";

// use an async function instead of the constructor for the stack definition
export const createStack = async (scope: cdk.Construct, id: string, props?: cdk.StackProps) => {
    const stack = new cdk.Stack(scope, id, props);

    const table = new dynamodb.Table(stack, 'storage-table', {
        tableName: 'STORAGE',
        partitionKey: {name: 'TIMESTAMP', type: dynamodb.AttributeType.STRING},
        stream: dynamodb.StreamViewType.NEW_IMAGE,
        removalPolicy: RemovalPolicy.DESTROY
    });

    const storageFunction = new lambda.Function(stack, 'storage-function', {
        runtime: lambda.Runtime.NODEJS_8_10,
        handler: "storage.handler",
        code: lambda.Code.fromAsset("./lambda"),
        environment: {
            TABLE_NAME: table.tableName
        }
    });
    table.grantReadWriteData(storageFunction);

    const certificate = await getCertificateArn();
    const api = new apigateway.LambdaRestApi(stack, 'storage-gateway', {
        handler: storageFunction,
        domainName: certificate ? {
            domainName: 'cdk-example.viesure.io',
            certificate: certManager.Certificate.fromCertificateArn(stack, 'viesureCertificate', certificate)
        } : undefined
    });
    if (certificate) {
        new route53.ARecord(stack, 'apiGatewayAlias', {
            recordName: 'cdk-example.viesure.io.',
            zone: (await getHostedZone(stack)),
            target: route53.RecordTarget.fromAlias(new route53_targets.ApiGateway(api))
        })
    }

    const queue = new sqs.Queue(stack, 'storage-queue', {
        queueName: 'storage-updates'
    });

    const proxyFunction = new lambda.Function(stack, 'proxy-function', {
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

    const vpc = new ec2.Vpc(stack, 'vpd', {});

    const dbUser = 'legacy';
    const dbPassword = 'legacyPASSWORD';
    const legacyDatabase = new rds.DatabaseInstance(stack, 'legacy-database', {
        engine: rds.DatabaseInstanceEngine.POSTGRES,
        masterUsername: dbUser,
        masterUserPassword: cdk.SecretValue.plainText(dbPassword),
        instanceClass: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
        vpc: vpc,
        removalPolicy: RemovalPolicy.DESTROY, // SNAPSHOT currently not supported https://github.com/aws/aws-cdk/issues/3298,
        deletionProtection: false
    });

    const legacyQueueProcessor = new ecsPatterns.QueueProcessingFargateService(stack, 'legacy-service', {
        image: ecs.AssetImage.fromAsset("./legacy-storage"),
        queue: queue,
        desiredTaskCount: 0, // Currently desiredCount 0 is not supported due to a bug, https://github.com/aws/aws-cdk/issues/4719
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

    const metrics = new Watchful(stack, 'metrics', {
        alarmEmail: 'elias.draexler@viesure.io'
    });
    metrics.watchScope(stack);
};

// get certificate that was created in a different stack
const getCertificateArn = async (): Promise<string | undefined> => {
    const certificateName = 'certificates:viesure';
    const cloudFormation = new AWS.CloudFormation();
    const result: AWS.CloudFormation.Exports | undefined = (await cloudFormation.listExports().promise()).Exports;
    const certificateExists = result && result.find(e => e.Name === certificateName);
    return certificateExists ? cdk.Fn.importValue(certificateName) : undefined;
};

// get already existing hosted zone
const getHostedZone = async (stack: cdk.Stack): Promise<IHostedZone> => {
    const route53Client = new AWS.Route53();
    const result = (await route53Client.listHostedZones().promise()).HostedZones.filter(hostedZone => hostedZone.Name === 'viesure.io.')[0];
    if (result.Id && result.Name) {
        return route53.HostedZone.fromHostedZoneAttributes(stack, 'id', {
            hostedZoneId: result.Id,
            zoneName: result.Name
        });
    } else {
        throw new Error('Hosted zone not found!');
    }
};
