import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as logs from "aws-cdk-lib/aws-logs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";

export class LinkedInScraperStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── VPC ──────────────────────────────────────────────────────
    // No NAT gateway — Fargate tasks get public IPs to save ~$32/mo.
    // RDS goes in isolated subnets (no internet access, only VPC-internal).
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: "Public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        {
          name: "Isolated",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    // ── Security Groups ─────────────────────────────────────────
    const albSg = new ec2.SecurityGroup(this, "AlbSg", { vpc });
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80));

    const taskSg = new ec2.SecurityGroup(this, "TaskSg", { vpc });
    taskSg.addIngressRule(albSg, ec2.Port.tcp(3000));

    const dbSg = new ec2.SecurityGroup(this, "DbSg", { vpc });
    dbSg.addIngressRule(taskSg, ec2.Port.tcp(3306));

    // ── Secrets Manager ─────────────────────────────────────────
    const dbPassword = new secretsmanager.Secret(this, "DbPassword", {
      description: "MariaDB password for linkedin_scraper",
      generateSecretString: {
        excludePunctuation: true,
        passwordLength: 32,
      },
    });

    const claudeApiKey = new secretsmanager.Secret(this, "ClaudeApiKey", {
      description: "Anthropic API key — update after first deploy",
      secretStringValue: cdk.SecretValue.unsafePlainText("REPLACE_ME"),
    });

    // ── RDS MariaDB ─────────────────────────────────────────────
    const db = new rds.DatabaseInstance(this, "Db", {
      engine: rds.DatabaseInstanceEngine.mariaDb({
        version: rds.MariaDbEngineVersion.VER_10_11,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MICRO,
      ),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSg],
      credentials: rds.Credentials.fromPassword(
        "appuser",
        dbPassword.secretValue,
      ),
      databaseName: "linkedin_scraper",
      allocatedStorage: 20,
      storageType: rds.StorageType.GP3,
      multiAz: false,
      deletionProtection: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      backupRetention: cdk.Duration.days(1),
    });

    // ── S3 — Resume Uploads ─────────────────────────────────────
    const resumeBucket = new s3.Bucket(this, "ResumeBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    // ── ECR Repository ──────────────────────────────────────────
    const repo = new ecr.Repository(this, "Repo", {
      repositoryName: "linkedin-scraper",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
      lifecycleRules: [{ maxImageCount: 5 }],
    });

    // ── ECS Cluster + Fargate ───────────────────────────────────
    const cluster = new ecs.Cluster(this, "Cluster", { vpc });

    const taskDef = new ecs.FargateTaskDefinition(this, "TaskDef", {
      cpu: 1024,
      memoryLimitMiB: 2048,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });

    const logGroup = new logs.LogGroup(this, "AppLogs", {
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const container = taskDef.addContainer("App", {
      image: ecs.ContainerImage.fromEcrRepository(repo, "latest"),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "app",
        logGroup,
      }),
      environment: {
        DB_HOST: db.instanceEndpoint.hostname,
        DB_PORT: "3306",
        DB_USER: "appuser",
        DB_NAME: "linkedin_scraper",
        RESUME_BUCKET: resumeBucket.bucketName,
        NODE_ENV: "production",
      },
      secrets: {
        DB_PASSWORD: ecs.Secret.fromSecretsManager(dbPassword),
        CLAUDE_API_KEY: ecs.Secret.fromSecretsManager(claudeApiKey),
      },
      healthCheck: {
        command: [
          "CMD-SHELL",
          "curl -f http://localhost:3000/ || exit 1",
        ],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    container.addPortMappings({ containerPort: 3000 });

    // Grant the task role access to the S3 bucket
    resumeBucket.grantReadWrite(taskDef.taskRole);

    // ── ALB ─────────────────────────────────────────────────────
    const alb = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      vpc,
      internetFacing: true,
      securityGroup: albSg,
    });

    const listener = alb.addListener("HttpListener", {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
    });

    // ── ECS Service ─────────────────────────────────────────────
    const service = new ecs.FargateService(this, "Service", {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 0, // Start at 0 — scale to 1 after pushing a Docker image to ECR
      assignPublicIp: true,
      securityGroups: [taskSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    listener.addTargets("AppTarget", {
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service],
      healthCheck: {
        path: "/",
        interval: cdk.Duration.seconds(60),
        healthyThresholdCount: 2,
      },
    });

    // ── Outputs ─────────────────────────────────────────────────
    new cdk.CfnOutput(this, "AlbDns", {
      value: alb.loadBalancerDnsName,
      description: "ALB DNS — access the app here",
    });

    new cdk.CfnOutput(this, "EcrRepoUri", {
      value: repo.repositoryUri,
      description: "ECR repository URI for docker push",
    });

    new cdk.CfnOutput(this, "ClaudeApiKeyArn", {
      value: claudeApiKey.secretArn,
      description:
        "Update after deploy: aws secretsmanager put-secret-value --secret-id <this> --secret-string sk-ant-...",
    });

    new cdk.CfnOutput(this, "DbEndpoint", {
      value: db.instanceEndpoint.hostname,
      description: "RDS MariaDB endpoint",
    });
  }
}
