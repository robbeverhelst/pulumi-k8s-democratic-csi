# Democratic CSI Storage Driver for Kubernetes

This Pulumi stack deploys the Democratic CSI storage driver for Kubernetes, enabling dynamic provisioning of persistent volumes using TrueNAS/FreeNAS storage backends.

## Features

- Support for both NFS and iSCSI storage protocols
- Multiple storage classes with different pools and configurations
- Dynamic volume provisioning and expansion
- Snapshot support
- Configurable retention policies

## Prerequisites

### TrueNAS Configuration

1. **Enable required services:**
   - SSH service for management
   - NFS service (for NFS volumes)
   - iSCSI service (for iSCSI volumes)

2. **Create ZFS datasets:**
   - Create parent datasets for each pool (will be created automatically if not present)
   - Example: `hdd-mirror-pool/k8s/nfs/vols`

3. **API Access:**
   - Generate an API key in TrueNAS UI
   - Ensure the user has appropriate permissions

### Kubernetes Node Prerequisites

Before deploying the CSI driver, ensure all Kubernetes nodes have the required packages installed:

#### For NFS volumes:
```bash
# Debian/Ubuntu
apt-get install -y nfs-common

# RHEL/CentOS/Rocky
yum install -y nfs-utils
```

#### For iSCSI volumes:
```bash
# Debian/Ubuntu
apt-get install -y open-iscsi multipath-tools

# RHEL/CentOS/Rocky
yum install -y iscsi-initiator-utils device-mapper-multipath

# Enable and start services
systemctl enable --now iscsid
systemctl enable --now multipathd
```

## Configuration

### Setting Secrets

Configure TrueNAS credentials using Pulumi secrets:

```bash
pulumi config set --secret truenasPassword <your-password>
pulumi config set --secret truenasApiKey <your-api-key>
```

Or use environment variables:
```bash
export TRUENAS_HOST="192.168.1.100"
export TRUENAS_USERNAME="root"
export TRUENAS_PASSWORD="your-password"
export TRUENAS_API_KEY="your-api-key"
```

### Storage Configurations

Edit `Pulumi.prod.yaml` to customize storage classes:

```yaml
democratic-csi:storageConfigs:
  - name: "truenas-ssd-mirror-nfs"
    pool: "ssd-mirror-pool"
    driverType: "nfs"
    defaultClass: true
    reclaimPolicy: "Retain"
    volumeBindingMode: "Immediate"
    allowVolumeExpansion: true
```

## Deployment

1. Install dependencies:
```bash
npm install
```

2. Select or create a Pulumi stack:
```bash
pulumi stack select prod
# or
pulumi stack new prod
```

3. Deploy the stack:
```bash
npm run preview  # Preview changes
npm run up       # Deploy
```

## Usage

After deployment, you can create PVCs using the deployed storage classes:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: test-pvc
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: truenas-ssd-mirror-nfs
  resources:
    requests:
      storage: 10Gi
```

## Storage Classes

The stack creates the following storage classes by default:

- `truenas-hdd-stripe-nfs`: NFS volumes on HDD stripe pool
- `truenas-hdd-mirror-nfs`: NFS volumes on HDD mirror pool
- `truenas-hdd-mirror-iscsi`: iSCSI volumes on HDD mirror pool
- `truenas-ssd-mirror-nfs`: NFS volumes on SSD mirror pool (default)

## Troubleshooting

### Check CSI driver pods:
```bash
kubectl get pods -n democratic-csi
```

### View CSI driver logs:
```bash
kubectl logs -n democratic-csi -l app.kubernetes.io/name=democratic-csi
```

### Verify storage classes:
```bash
kubectl get storageclass
```

### Test volume provisioning:
```bash
kubectl apply -f - <<EOF
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: test-claim
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: truenas-ssd-mirror-nfs
  resources:
    requests:
      storage: 1Gi
EOF

kubectl get pvc test-claim
kubectl get pv
```

## Cleanup

To remove the stack:
```bash
npm run destroy
```