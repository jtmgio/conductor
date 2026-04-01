#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CommandCenterStack } from '../lib/command-center-stack';

const app = new cdk.App();
new CommandCenterStack(app, 'CommandCenterStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' },
});
