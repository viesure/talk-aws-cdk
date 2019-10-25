const {DynamoDB} = require('aws-sdk');

exports.handler = async function (event) {
    console.log("request:", JSON.stringify(event, undefined, 2));

    // create AWS SDK clients
    const dynamo = new DynamoDB();

    var ts = Math.round((new Date()).getTime() / 1000);

    await dynamo.putItem({
        TableName: process.env.TABLE_NAME,
        Item: {
            'TIMESTAMP': {S: `${ts}`},
            'DATA': {S: event.queryStringParameters.data}
        }
    }).promise();

    return {
        statusCode: 200,
        headers: {'Content-Type': 'text/plain'},
        body: `Saved the data!\n`
    };
};