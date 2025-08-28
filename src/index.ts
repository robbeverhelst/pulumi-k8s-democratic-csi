import { config, Namespace } from '@homelab/shared'
import { DemocraticCSIDriver } from './driver'

const cfg = config('democratic-csi')
const namespaceName = cfg.get('namespace', 'democratic-csi')
const namespace = new Namespace('namespace', { metadata: { name: namespaceName } })
const truenas = {
  host: process.env.TRUENAS_HOST || '',
  username: process.env.TRUENAS_USERNAME || '',
  password: process.env.TRUENAS_PASSWORD || '',
  apiKey: process.env.TRUENAS_API_KEY || '',
}

const storageClasses = [
  {
    name: 'truenas-hdd-stripe-nfs',
    pool: 'hdd-stripe-pool',
    driverType: 'nfs' as const,
    defaultClass: false,
  },
  {
    name: 'truenas-hdd-mirror-nfs',
    pool: 'hdd-mirror-pool',
    driverType: 'nfs' as const,
    defaultClass: true,
  },
  {
    name: 'truenas-hdd-mirror-iscsi',
    pool: 'hdd-mirror-pool',
    driverType: 'iscsi' as const,
    defaultClass: false,
  },
]

const drivers = storageClasses.map(
  (sc) =>
    new DemocraticCSIDriver(
      sc.name,
      {
        namespace: namespaceName,
        name: sc.name,
        pool: sc.pool,
        driverType: sc.driverType,
        truenas,
        defaultClass: sc.defaultClass,
      },
      { dependsOn: [namespace] },
    ),
)

export const charts = drivers.map((d) => d.chart.urn)
export const storageClassNames = storageClasses.map((sc) => sc.name)
export { namespaceName }
