#!/usr/bin/env node
import 'source-map-support/register';
import {createStack} from '../lib/cdk-example-stack';
import cdk = require('@aws-cdk/core');

const app = new cdk.App();
const myStack = createStack(app, 'CdkExampleStack');
