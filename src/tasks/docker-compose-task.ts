import { spawn, SpawnOptionsWithoutStdio } from 'node:child_process';
import { stringify } from 'yaml';
import {
  DockerTaskBase,
  DockerTaskBaseOptions,
  DockerTaskBaseState,
} from './docker-task-base.js';
import { getStartedProjectName } from '../state/project.js';
import { isDockerInstalled } from '../utils/is-docker-installed.js';
import { isDockerRunning } from '../utils/is-docker-running.js';
import { pullImage } from '../utils/pull-image.js';
import { isImagePulled } from '../utils/is-image-pulled.js';

/**
 * Docker service configuration
 */
export interface DockerComposeService {
  image: string;
  containerName?: string;
  command?: string | string[];
  ports?: string[];
  volumes?: string[];
  environment?: { [key: string]: string | number | boolean };
  networks?: string[];
  dependsOn?: string[];
  restart?: 'no' | 'always' | 'on-failure' | 'unless-stopped';
  user?: string;
  workdir?: string;
  hostname?: string;
  entrypoint?: string | string[];
  privileged?: boolean;
  expose?: string[];
  extraHosts?: string[];
  stopSignal?: string;
  stopGracePeriod?: string;
  healthcheck?: {
    test: string | string[];
    interval?: string;
    timeout?: string;
    retries?: number;
    start_period?: string;
  };
  platform?: string;
}

/**
 * Docker compose task options
 */
export interface DockerComposeTaskOptions extends DockerTaskBaseOptions {
  services: { [serviceName: string]: DockerComposeService };
  networks?: { [networkName: string]: unknown };
  volumes?: { [volumeName: string]: unknown };
}

/**
 * Docker compose task state
 */
export type DockerComposeTaskState = DockerTaskBaseState;

interface DockerComposeYaml {
  version: string;
  services: Record<string, Record<string, unknown>>;
  networks?: Record<string, unknown>;
  volumes?: Record<string, unknown>;
}

const { TaskStatus } = runium.enum;

/**
 * Field mappings from DockerComposeService to docker-compose YAML keys
 * [sourceKey, targetKey, type]
 */
const SERVICE_FIELD_MAPPINGS: [
  keyof DockerComposeService,
  string,
  'string' | 'array' | 'object',
][] = [
  ['containerName', 'container_name', 'string'],
  ['command', 'command', 'string'],
  ['ports', 'ports', 'array'],
  ['volumes', 'volumes', 'array'],
  ['environment', 'environment', 'object'],
  ['networks', 'networks', 'array'],
  ['dependsOn', 'depends_on', 'array'],
  ['restart', 'restart', 'string'],
  ['user', 'user', 'string'],
  ['workdir', 'working_dir', 'string'],
  ['hostname', 'hostname', 'string'],
  ['entrypoint', 'entrypoint', 'string'],
  ['privileged', 'privileged', 'string'],
  ['expose', 'expose', 'array'],
  ['extraHosts', 'extra_hosts', 'array'],
  ['stopSignal', 'stop_signal', 'string'],
  ['stopGracePeriod', 'stop_grace_period', 'string'],
  ['healthcheck', 'healthcheck', 'object'],
  ['platform', 'platform', 'string'],
];

/**
 * Docker compose task class
 */
export class DockerComposeTask extends DockerTaskBase<
  DockerComposeTaskOptions,
  DockerComposeTaskState
> {
  protected readonly projectName: string;
  protected readonly composeFile: string;
  protected readonly version: string = '3.8';

  // 128 + SIGTERM when stopping docker-compose
  protected correctExitCodes: number[] = [130];

  constructor(protected readonly options: DockerComposeTaskOptions) {
    super(options);

    this.projectName = `runium-${getStartedProjectName()}`;
    this.composeFile = `docker-compose-${this.projectName}.yml`;
  }

  /**
   * Generate docker-compose YAML content
   */
  private generateComposeYaml(): string {
    const compose: DockerComposeYaml = {
      version: this.version,
      services: {},
    };

    // services
    for (const [serviceName, service] of Object.entries(
      this.options.services
    )) {
      const serviceConfig: Record<string, unknown> = {
        image: service.image,
      };

      for (const [sourceKey, targetKey, type] of SERVICE_FIELD_MAPPINGS) {
        const value = service[sourceKey];
        if (value == null) continue;

        if (type === 'array') {
          if (Array.isArray(value) && value.length > 0) {
            serviceConfig[targetKey] = value;
          }
        } else if (type === 'object') {
          if (typeof value === 'object' && Object.keys(value).length > 0) {
            serviceConfig[targetKey] = value;
          }
        } else {
          serviceConfig[targetKey] = value;
        }
      }

      compose.services[serviceName] = serviceConfig;
    }

    // networks if specified
    if (
      this.options.networks &&
      Object.keys(this.options.networks).length > 0
    ) {
      compose.networks = this.options.networks;
    }

    // volumes if specified
    if (this.options.volumes && Object.keys(this.options.volumes).length > 0) {
      compose.volumes = this.options.volumes;
    }

    // convert to YAML format using yaml package
    return stringify(compose);
  }

  /**
   * Pull all images for services
   */
  private async pullAllImages(): Promise<void> {
    const imageMap = new Map<string, string | undefined>();

    for (const service of Object.values(this.options.services)) {
      if (!imageMap.has(service.image)) {
        imageMap.set(service.image, service.platform);
      }
    }

    for (const [imageName, platform] of imageMap) {
      if (!(await isImagePulled(imageName))) {
        this.updateState({
          reason: `pull image: ${imageName}`,
        });
        await pullImage(imageName, {
          onStdErr: this.onStdErrData.bind(this),
          platform,
        });
      }
    }
  }

  /**
   * Prepare docker-compose command arguments
   */
  private prepareDockerComposeArgs(command: string): string[] {
    const args: string[] = ['compose'];

    args.push('-p', this.projectName);
    args.push('-f', runium.storage.getPath(['docker', this.composeFile]));
    args.push(command);

    return args;
  }

  /**
   * Start task
   */
  async start(): Promise<void> {
    if (!this.canStart()) {
      return;
    }

    this.updateState({
      status: TaskStatus.STARTING,
      iteration: this.state.iteration + 1,
      pid: -1,
      exitCode: undefined,
      error: undefined,
      reason: undefined,
    });

    if (!(await isDockerInstalled())) {
      this.onError(new Error('Docker is not installed'), 1);
      return;
    }

    if (!(await isDockerRunning())) {
      this.onError(new Error('Docker is not running'), 1);
      return;
    }

    try {
      // generate docker-compose yaml file
      const yamlContent = this.generateComposeYaml();
      await runium.storage.ensureDirExists(['docker']);
      await runium.storage.write(['docker', this.composeFile], yamlContent);

      await this.initLogStreams();

      await this.pullAllImages();

      // Start docker-compose
      const args = this.prepareDockerComposeArgs('up');

      this.process = spawn('docker', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      } as SpawnOptionsWithoutStdio);

      this.addProcessListeners();

      this.setTTLTimer();

      this.updateState({
        status: TaskStatus.STARTED,
        pid: this.process!.pid,
        reason: undefined,
      });
    } catch (error) {
      this.onError(error as Error);
    }
  }

  /**
   * Stop task
   * @param reason
   */
  async stop(reason: string = ''): Promise<void> {
    if (!this.canStop()) {
      return;
    }

    this.updateState({
      status: TaskStatus.STOPPING,
      reason,
    });

    try {
      // stop docker-compose services
      const args = this.prepareDockerComposeArgs('down');

      await new Promise<void>((resolve, reject) => {
        const stopProcess = spawn('docker', args);
        stopProcess.on('exit', code => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Docker compose down exited with code ${code}`));
          }
        });
        stopProcess.on('error', reject);
      });
    } catch (error) {
      this.onError(error as Error);
    }
  }
}
