# Azure runtime reference

Use this reference after the user chooses Azure and identifies the runtime
host. Do not assume a subscription, region, resource group, resource type, or
Key Vault.

Use the installed Azure CLI's `--help` output for exact flags. Primary sources:

- [Azure CLI reference](https://learn.microsoft.com/cli/azure/)
- [Azure identity best practices](https://learn.microsoft.com/entra/identity/managed-identities-azure-resources/overview)
- [Azure network security](https://learn.microsoft.com/azure/security/fundamentals/network-best-practices)
- [Azure Key Vault](https://learn.microsoft.com/azure/key-vault/general/overview)

## Prerequisites

- Azure CLI installed and authenticated to the intended tenant/subscription.
- A selected resource group and runtime host.
- Compute with outbound HTTPS and DNS access to the Kei control plane.
- A least-privilege managed identity, workload identity, or service identity.
- A secure credential injection mechanism. Azure Key Vault is an option, not a
  requirement.
- Logs and a restart/reload path for the runtime process.

## Safe checks

```sh
command -v az
az version
az account show --output json
az group show --name RESOURCE_GROUP --output json
az resource list --resource-group RESOURCE_GROUP --output json
```

Use the host-specific metadata command only after the user identifies the
resource. Examples:

```sh
az containerapp show --name APP --resource-group RESOURCE_GROUP --output json
az aks show --name CLUSTER --resource-group RESOURCE_GROUP --output json
az vm show --name VM --resource-group RESOURCE_GROUP --output json
```

Inspect provisioning state, identity attachment, network placement, and
recent logs. Never retrieve or print secret values during a setup check.

## Remediation guidance

- CLI missing or outdated: install or update Azure CLI through the customer's
  approved workstation process; do not change subscriptions silently.
- Wrong tenant or subscription: ask the user to select the intended context;
  never change it silently.
- No outbound control-plane access: inspect virtual network routes, NSGs,
  private DNS, proxies, and TLS interception with the customer's network
  owner.
- No secure credential injection: configure the customer's chosen mechanism,
  then restart/reload the runtime.
- Stale runtime: deploy or restart the expected runtime/proxy version and
  rerun `kei bot status`.

If a runtime credential must be replaced, obtain it through the Kei CLI's
pipe-safe rotation flow and write it only to the user-approved destination.
