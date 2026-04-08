#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { LinkedInScraperStack } from "../lib/stack";

const app = new cdk.App();

new LinkedInScraperStack(app, "LinkedInScraperStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
  },
});
