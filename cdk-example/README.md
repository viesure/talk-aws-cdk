# CDK Example
This cdk application should showcase a cloud architecture that uses multiple aws services.

## Deployment
Before deploying for the first time be sure to execute `cdk bootstrap` and build the kotlin project 
```
cd legacy-storage
./mvnw clean package
cd ..
```

To test the example execute `cdk deploy`, this will use your default aws-cli profile to execute the cloudformation changeset.
If you don't want to use your default profile supply the profile argument `cdk deploy --profile PROFILE`.

As this example can produce costs be sure to shutdown the stack after testing using `cdk destroy --profile PROFILE`.


# Useful commands

 * `npm run build`   compile typescript to js
 * `npm run watch`   watch for changes and compile
 * `npm run test`    perform the jest unit tests
 * `cdk deploy`      deploy this stack to your default AWS account/region
 * `cdk diff`        compare deployed stack with current state
 * `cdk synth`       emits the synthesized CloudFormation template
