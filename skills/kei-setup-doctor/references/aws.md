# AWS runtime reference

Use this reference after the user chooses AWS and identifies the runtime host.
Do not assume ECS, EKS, EC2, Lambda, a region, an account, or a secret
manager.

Use the installed AWS CLI's `--help` output for exact flags. Primary sources:

- [AWS CLI command reference](https://docs.aws.amazon.com/cli/latest/reference/)
- [AWS IAM best practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [AWS VPC security best practices](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-best-practices.html)
- [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html)

## Prerequisites

- AWS CLI installed and authenticated to the intended account.
- A selected region and runtime host.
- Compute with outbound HTTPS and DNS access to the Kei control plane.
- A least-privilege runtime identity or task/instance role.
- A secure credential injection mechanism. AWS Secrets Manager or SSM
  Parameter Store are options, not requirements.
- Logs and a restart/reload path for the runtime process.

## Safe checks

```sh
command -v aws
aws --version
aws sts get-caller-identity --output json
aws configure get region
```

If the host is not known yet, these read-only enumerations can discover likely
runtime locations. Use the intended profile and region, and treat the output
as a candidate list that still requires user confirmation:

```sh
aws ecs list-clusters --output json
aws eks list-clusters --output json
aws ec2 describe-instances --filters Name=instance-state-name,Values=running --output json
```

AWS CLI can identify the EKS cluster, but it cannot inspect Kubernetes pods or
ReplicaSets. For EKS, resolve the Kubernetes context before querying the
workload; the context may be the full cluster ARN rather than the cluster
name:

```sh
kubectl config get-contexts -o name
kubectl get pods -A -o wide
kubectl get rs -n NAMESPACE
kubectl logs -n NAMESPACE POD -c CONTAINER --tail=200
kubectl logs -n NAMESPACE POD -c CONTAINER -p --tail=200
```

Use the previous-container logs only when the container restarted. Compare
the failing ReplicaSet's image with the previously healthy one. A new image
that fails on a control-plane endpoint with `404` or `405` is a version-skew
signal, not proof of an AWS networking fault.

Use the host-specific metadata command after the user identifies or confirms
the resource. Examples:

```sh
aws ecs describe-services --cluster CLUSTER --services SERVICE --output json
aws eks describe-cluster --name CLUSTER --output json
aws ec2 describe-instances --instance-ids INSTANCE_ID --output json
```

Inspect status, role/identity attachment, network placement, and recent logs.
Never retrieve or print secret values during a setup check.

## Remediation guidance

- CLI missing or outdated: install or update AWS CLI through the customer's
  approved workstation process; do not change profiles silently.
- Wrong account or region: ask the user to select the intended profile/region;
  never change it silently.
- No outbound control-plane access: inspect route tables, security groups,
  network ACLs, proxies, DNS, and TLS interception with the customer's network
  owner.
- No secure credential injection: configure the customer's chosen mechanism,
  then restart/reload the runtime.
- Stale runtime: deploy or restart the expected runtime/proxy version and
  rerun `kei bot status`.

If a runtime credential must be replaced, obtain it through the Kei CLI's
pipe-safe rotation flow and write it only to the user-approved destination.
