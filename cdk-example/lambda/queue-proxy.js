const {SQS} = require('aws-sdk');

exports.handler = async function (event) {
    console.log("request:", JSON.stringify(event, undefined, 2));

    const queue = new SQS();

    const entries = event.Records
        .map(record => record.dynamodb.NewImage)
        .map(record => {
            return {
                Id: record.TIMESTAMP.S,
                MessageBody: JSON.stringify({
                    timestamp: record.TIMESTAMP.S,
                    data: record.DATA.S
                })
            };
        });

    await queue.sendMessageBatch({
        QueueUrl: process.env.QUEUE_URL,
        Entries: entries
    }).promise();

    return {
        statusCode: 200,
        body: null
    };
};