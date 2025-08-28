import { Component } from '@homelab/shared'
import { Chart } from '@pulumi/kubernetes/helm/v3'
import type { ComponentResourceOptions } from '@pulumi/pulumi'

export interface DemocraticCSIConfig {
  namespace: string
  name: string
  pool: string
  driverType: 'iscsi' | 'nfs'
  truenas: {
    host: string
    username: string
    password: string
    apiKey: string
  }
  defaultClass?: boolean
}

export class DemocraticCSIDriver extends Component {
  public readonly chart: Chart

  constructor(name: string, config: DemocraticCSIConfig, opts?: ComponentResourceOptions) {
    super('homelab:storage', name, config, opts)

    this.chart = new Chart(
      this.name('chart'),
      {
        chart: 'democratic-csi',
        namespace: config.namespace,
        version: process.env.DEMOCRATIC_CSI_VERSION,
        fetchOpts: { repo: 'https://democratic-csi.github.io/charts' },
        values: {
          csiDriver: {
            name: `org.democratic-csi.${config.name}`,
            storageCapacity: true,
            attachRequired: config.driverType === 'iscsi',
            fsGroupPolicy: config.driverType === 'nfs' ? 'ReadWriteOnceWithFSType' : 'File',
          },
          controller: {
            driver: {
              enabled: true,
              image: {
                registry: 'docker.io/democraticcsi/democratic-csi',
                tag: process.env.DEMOCRATIC_CSI_IMAGE_TAG,
              },
            },
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
              name: config.name,
              defaultClass: config.defaultClass ?? false,
              reclaimPolicy: 'Retain',
              volumeBindingMode: 'Immediate',
              allowVolumeExpansion: true,
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
          ...(config.driverType === 'nfs'
            ? {
                driver: {
                  config: {
                    driver: 'freenas-nfs',
                    instance_id: '',
                    httpConnection: {
                      protocol: 'http',
                      host: config.truenas.host,
                      port: 80,
                      apiKey: config.truenas.apiKey,
                      allowInsecure: true,
                    },
                    sshConnection: {
                      host: config.truenas.host,
                      port: 22,
                      username: config.truenas.username,
                      password: config.truenas.password,
                    },
                    zfs: {
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
                    },
                    nfs: {
                      shareHost: config.truenas.host,
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
            : {
                driver: {
                  config: {
                    driver: 'freenas-iscsi',
                    instance_id: '',
                    httpConnection: {
                      protocol: 'http',
                      host: config.truenas.host,
                      port: 80,
                      apiKey: config.truenas.apiKey,
                      allowInsecure: true,
                    },
                    sshConnection: {
                      host: config.truenas.host,
                      port: 22,
                      username: config.truenas.username,
                      password: config.truenas.password,
                    },
                    zfs: {
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
                    },
                    iscsi: {
                      targetPortal: `${config.truenas.host}:3260`,
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
              }),
        },
      },
      { parent: this },
    )
  }
}
