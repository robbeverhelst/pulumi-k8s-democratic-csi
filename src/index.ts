import { Namespace } from '@pulumi/kubernetes/core/v1'
import { all, Config, type Output, secret } from '@pulumi/pulumi'
import { DemocraticCSI, type DemocraticCSIConfig, type TruenasConfig } from './democratic-csi'

// Get TrueNAS configuration from environment variables
const truenasHost = process.env.TRUENAS_HOST
const truenasUsername = process.env.TRUENAS_USERNAME
const truenasPassword = process.env.TRUENAS_PASSWORD
const truenasApiKey = process.env.TRUENAS_API_KEY

if (!truenasHost || !truenasUsername || !truenasPassword || !truenasApiKey) {
  throw new Error(
    'Missing required TrueNAS environment variables: TRUENAS_HOST, TRUENAS_USERNAME, TRUENAS_PASSWORD, TRUENAS_API_KEY',
  )
}

// TrueNAS configuration
const truenasConfig: TruenasConfig = {
  host: truenasHost,
  username: truenasUsername,
  password: secret(truenasPassword),
  apiKey: secret(truenasApiKey),
}

// Get Democratic CSI configuration from Pulumi config
const config = new Config()

// Storage pool configurations from Pulumi config
const storageConfigs: DemocraticCSIConfig[] = config.getObject<DemocraticCSIConfig[]>('storageClasses') || [
  {
    name: 'truenas-hdd-stripe-nfs',
    pool: 'hdd-stripe-pool',
    driverType: 'nfs',
    defaultClass: false,
    reclaimPolicy: 'Retain',
    volumeBindingMode: 'Immediate',
    allowVolumeExpansion: true,
  },
  {
    name: 'truenas-hdd-mirror-nfs',
    pool: 'hdd-mirror-pool',
    driverType: 'nfs',
    defaultClass: true,
    reclaimPolicy: 'Retain',
    volumeBindingMode: 'Immediate',
    allowVolumeExpansion: true,
  },
  {
    name: 'truenas-hdd-mirror-iscsi',
    pool: 'hdd-mirror-pool',
    driverType: 'iscsi',
    defaultClass: false,
    reclaimPolicy: 'Retain',
    volumeBindingMode: 'Immediate',
    allowVolumeExpansion: true,
  },
]

// Create namespace for democratic-csi
const namespace = new Namespace('democratic-csi-namespace', {
  metadata: {
    name: 'democratic-csi',
    labels: {
      'app.kubernetes.io/name': 'democratic-csi',
      'app.kubernetes.io/managed-by': 'pulumi',
    },
  },
})

// Deploy Democratic CSI drivers
const csiDrivers: DemocraticCSI[] = []
const storageClassNames: Output<string>[] = []

for (const csiConfig of storageConfigs) {
  const csiDriver = new DemocraticCSI(csiConfig.name, truenasConfig, csiConfig, { dependsOn: [namespace] })

  csiDrivers.push(csiDriver)
  storageClassNames.push(csiDriver.storageClassName)
}

// Export useful information
export const namespaceName = namespace.metadata.name
export const storageClasses = all(storageClassNames)

// Export a summary
export const summary = all([namespaceName, storageClasses]).apply(([ns, classes]) => ({
  namespace: ns,
  storageClasses: classes,
  message: `Democratic CSI deployed with ${classes.length} storage class(es)`,
}))
