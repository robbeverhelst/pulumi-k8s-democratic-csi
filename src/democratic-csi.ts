import { Chart } from '@pulumi/kubernetes/helm/v3'
import { ComponentResource, type Input, Output, type ResourceOptions } from '@pulumi/pulumi'

export interface TruenasConfig {
  host: Input<string>
  username: Input<string>
  password: Input<string>
  apiKey: Input<string>
}

export interface DemocraticCSIConfig {
  name: string
  pool: string
  driverType: 'iscsi' | 'nfs'
  defaultClass?: boolean
  reclaimPolicy?: 'Retain' | 'Delete'
  volumeBindingMode?: 'Immediate' | 'WaitForFirstConsumer'
  allowVolumeExpansion?: boolean
}

export class DemocraticCSI extends ComponentResource {
  public readonly chart: Chart
  public readonly storageClassName: Output<string>

  constructor(name: string, truenas: TruenasConfig, config: DemocraticCSIConfig, opts?: ResourceOptions) {
    super(`homelab:storage:democratic-csi-${config.name}`, name, config, opts)

    const httpConnection = {
      protocol: 'http',
      host: truenas.host,
      port: 80,
      apiKey: truenas.apiKey,
      allowInsecure: true,
    }

    const sshConnection = {
      host: truenas.host,
      port: 22,
      username: truenas.username,
      password: truenas.password,
    }

    const baseZfsConfig =
      config.driverType === 'nfs'
        ? {
            cli: {
              paths: {
                zfs: '/usr/sbin/zfs',
                zpool: '/usr/sbin/zpool',
                sudo: '/usr/bin/sudo',
                chroot: '/usr/sbin/chroot',
              },
            },
            datasetParentName: `${config.pool}/k8s/${config.driverType}/vols`,
            detachedSnapshotsDatasetParentName: `${config.pool}/k8s/${config.driverType}/snaps`,
            datasetEnableQuotas: true,
            datasetEnableReservation: false,
            datasetPermissionsMode: '0777',
            datasetPermissionsUser: 0,
            datasetPermissionsGroup: 0,
          }
        : {
            cli: {
              paths: {
                zfs: '/usr/sbin/zfs',
                zpool: '/usr/sbin/zpool',
                sudo: '/usr/bin/sudo',
                chroot: '/usr/sbin/chroot',
              },
            },
            datasetParentName: `${config.pool}/k8s/${config.driverType}/vols`,
            detachedSnapshotsDatasetParentName: `${config.pool}/k8s/${config.driverType}/snaps`,
            zvolCompression: '',
            zvolDedup: '',
            zvolEnableReservation: false,
            zvolBlocksize: '16K',
          }

    const iscsiConfig = {
      driver: {
        config: {
          driver: 'freenas-iscsi',
          instance_id: '',
          httpConnection,
          sshConnection,
          zfs: baseZfsConfig,
          iscsi: {
            targetPortal: `${truenas.host}:3260`,
            targetPortals: [],
            interface: '',
            namePrefix: 'k8s-',
            nameSuffix: '',
            targetGroups: [
              {
                targetGroupPortalGroup: 1,
                targetGroupInitiatorGroup: 1,
                targetGroupAuthType: 'None',
                targetGroupAuthGroup: '',
              },
            ],
            extentInsecureTpc: true,
            extentXenCompat: false,
            extentDisablePhysicalBlocksize: true,
            extentBlocksize: 512,
            extentRpm: 'SSD',
            extentAvailThreshold: 0,
          },
        },
      },
    }

    const nfsConfig = {
      driver: {
        config: {
          driver: 'freenas-nfs',
          instance_id: '',
          httpConnection,
          sshConnection,
          zfs: baseZfsConfig,
          nfs: {
            shareHost: truenas.host,
            shareAlldirs: false,
            shareAllowedHosts: [],
            shareAllowedNetworks: [],
            shareMaprootUser: 'root',
            shareMaprootGroup: 'wheel',
            shareMapallUser: '',
            shareMapallGroup: '',
          },
        },
      },
    }

    const storageClassName = `${config.name}`
    this.storageClassName = Output.create(storageClassName)

    this.chart = new Chart(
      config.name,
      {
        chart: 'democratic-csi',
        namespace: 'democratic-csi',
        version: process.env.DEMOCRATIC_CSI_VERSION ?? 'latest',
        fetchOpts: {
          repo: 'https://democratic-csi.github.io/charts',
        },
        values: {
          csiDriver: {
            name: `org.democratic-csi.${config.name}`,
            storageCapacity: true,
            attachRequired: config.driverType === 'iscsi',
            fsGroupPolicy: config.driverType === 'nfs' ? 'ReadWriteOnceWithFSType' : 'File',
          },
          controller: {
            externalAttacher: {
              enabled: config.driverType === 'iscsi',
            },
            externalProvisioner: {
              enabled: true,
            },
            externalResizer: {
              enabled: true,
            },
            externalSnapshotter: {
              enabled: true,
            },
          },
          storageClasses: [
            {
              name: storageClassName,
              defaultClass: config.defaultClass ?? false,
              reclaimPolicy: config.reclaimPolicy ?? 'Retain',
              volumeBindingMode: config.volumeBindingMode ?? 'Immediate',
              allowVolumeExpansion: config.allowVolumeExpansion ?? true,
              parameters: {
                fsType: config.driverType === 'nfs' ? 'nfs' : 'ext4',
              },
              mountOptions:
                config.driverType === 'nfs' ? ['noatime', 'nfsvers=4.2', 'hard', 'rsize=131072', 'wsize=131072'] : [],
              secrets: {
                'provisioner-secret': {},
                'controller-publish-secret': {},
                'node-stage-secret': {},
                'node-publish-secret': {},
                'controller-expand-secret': {},
              },
            },
          ],
          ...(config.driverType === 'nfs' ? nfsConfig : iscsiConfig),
        },
      },
      { provider: opts?.provider, parent: this },
    )

    this.registerOutputs({
      chart: this.chart,
      storageClassName: this.storageClassName,
    })
  }
}
