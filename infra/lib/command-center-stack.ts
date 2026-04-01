import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export class CommandCenterStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromLookup(this, 'DefaultVpc', { isDefault: true });

    const sg = new ec2.SecurityGroup(this, 'SG', { vpc, allowAllOutbound: true });
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'HTTP');
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS');
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'SSH');

    const role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')],
    });

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      '#!/bin/bash', 'set -euo pipefail',
      'apt-get update && apt-get upgrade -y',
      'curl -fsSL https://deb.nodesource.com/setup_20.x | bash -',
      'apt-get install -y nodejs postgresql postgresql-contrib nginx certbot python3-certbot-nginx',
      'systemctl enable postgresql && systemctl start postgresql',
      "sudo -u postgres psql -c \"CREATE USER conductor WITH PASSWORD 'cc_prod_pw';\"",
      'sudo -u postgres psql -c "CREATE DATABASE conductor OWNER conductor;"',
      'npm install -g pm2',
      'mkdir -p /opt/conductor/uploads && chown -R ubuntu:ubuntu /opt/conductor',
      'cat > /etc/nginx/sites-available/conductor << \'NGINX\'',
      'server { listen 80; server_name _; client_max_body_size 10M;',
      '  location / { proxy_pass http://127.0.0.1:3000; proxy_http_version 1.1;',
      '    proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";',
      '    proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr;',
      '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
      '    proxy_set_header X-Forwarded-Proto $scheme; } }',
      'NGINX',
      'ln -sf /etc/nginx/sites-available/conductor /etc/nginx/sites-enabled/',
      'rm -f /etc/nginx/sites-enabled/default && systemctl reload nginx',
      'env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu',
    );

    const instance = new ec2.Instance(this, 'CC', {
      vpc, instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.SMALL),
      machineImage: ec2.MachineImage.fromSsmParameter(
        '/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id'),
      securityGroup: sg, role, userData,
      blockDevices: [{ deviceName: '/dev/sda1', volume: ec2.BlockDeviceVolume.ebs(30, { volumeType: ec2.EbsDeviceVolumeType.GP3, encrypted: true }) }],
      keyPair: this.node.tryGetContext('keyPair')
        ? ec2.KeyPair.fromKeyPairName(this, 'KP', this.node.tryGetContext('keyPair')) : undefined,
    });

    const eip = new ec2.CfnEIP(this, 'EIP', { instanceId: instance.instanceId });

    const fn = new lambda.Function(this, 'Sched', {
      runtime: lambda.Runtime.PYTHON_3_12, handler: 'index.handler', timeout: cdk.Duration.seconds(30),
      code: lambda.Code.fromInline(`
import boto3,os
ec2=boto3.client('ec2');IID=os.environ['INSTANCE_ID']
def handler(e,c):
  a=e.get('action','')
  if a=='start':ec2.start_instances(InstanceIds=[IID])
  elif a=='stop':ec2.stop_instances(InstanceIds=[IID])
  return{'status':'ok','action':a}
`),
      environment: { INSTANCE_ID: instance.instanceId },
    });

    fn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ec2:StartInstances', 'ec2:StopInstances'],
      resources: [`arn:aws:ec2:${this.region}:${this.account}:instance/${instance.instanceId}`],
    }));

    new events.Rule(this, 'Start', {
      schedule: events.Schedule.cron({ minute: '0', hour: '10', weekDay: 'MON-FRI' }),
      targets: [new targets.LambdaFunction(fn, { event: events.RuleTargetInput.fromObject({ action: 'start' }) })],
    });
    new events.Rule(this, 'Stop', {
      schedule: events.Schedule.cron({ minute: '0', hour: '1', weekDay: 'TUE-SAT' }),
      targets: [new targets.LambdaFunction(fn, { event: events.RuleTargetInput.fromObject({ action: 'stop' }) })],
    });

    new cdk.CfnOutput(this, 'InstanceId', { value: instance.instanceId });
    new cdk.CfnOutput(this, 'PublicIP', { value: eip.ref });
    new cdk.CfnOutput(this, 'SSH', { value: `ssh -i ~/.ssh/key.pem ubuntu@${eip.ref}` });
  }
}
