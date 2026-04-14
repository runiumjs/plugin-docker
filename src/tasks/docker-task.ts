import { spawn, SpawnOptionsWithoutStdio } from 'node:child_process';
import {
  DockerTaskBase,
  DockerTaskBaseOptions,
  DockerTaskBaseState,
} from './docker-task-base.js';
import { isDockerInstalled } from '../utils/is-docker-installed.js';
import { isDockerRunning } from '../utils/is-docker-running.js';
import { pullImage } from '../utils/pull-image.js';
import { isImagePulled } from '../utils/is-image-pulled.js';

/**
 * Docker task options
 */
export interface DockerTaskOptions extends DockerTaskBaseOptions {
  image: string;
  containerName?: string;
  command?: string;
  arguments?: string[];
  ports?: string[];
  volumes?: string[];
  env?: { [key: string]: string | number | boolean };
  network?: string;
  autoRemove?: boolean;
  user?: string;
  workdir?: string;
  entrypoint?: string;
  privileged?: boolean;
  restart?: 'no' | 'always' | 'on-failure' | 'unless-stopped';
  memory?: string;
  cpus?: string;
  hostname?: string;
  envFile?: string[];
  stopSignal?: string;
  stopTimeout?: number;
  pull?: 'always' | 'missing' | 'never';
  platform?: string;
}

/**
 * Docker task state
 */
export interface DockerTaskState extends DockerTaskBaseState {
  containerName?: string;
}

const { TaskStatus } = runium.enum;

/**
 * Field mappings from DockerTaskOptions to docker run flags
 * [sourceKey, dockerFlag, type]
 */
const DOCKER_RUN_FIELD_MAPPINGS: [
  keyof DockerTaskOptions,
  string,
  'string' | 'array' | 'boolean',
][] = [
  ['containerName', '--name', 'string'],
  ['network', '--network', 'string'],
  ['user', '--user', 'string'],
  ['workdir', '--workdir', 'string'],
  ['entrypoint', '--entrypoint', 'string'],
  ['restart', '--restart', 'string'],
  ['memory', '--memory', 'string'],
  ['cpus', '--cpus', 'string'],
  ['hostname', '--hostname', 'string'],
  ['stopSignal', '--stop-signal', 'string'],
  ['pull', '--pull', 'string'],
  ['platform', '--platform', 'string'],
  ['ports', '-p', 'array'],
  ['volumes', '-v', 'array'],
  ['envFile', '--env-file', 'array'],
  ['privileged', '--privileged', 'boolean'],
];

/**
 * Docker task class
 */
export class DockerTask extends DockerTaskBase<
  DockerTaskOptions,
  DockerTaskState
> {
  // 128 + SIGKILL when stopping docker container
  protected correctExitCodes: number[] = [137];

  constructor(protected readonly options: DockerTaskOptions) {
    super(options);

    this.options.containerName ??= `runium-${this.options.image.replaceAll('/', '-').replaceAll(':', '-')}-${Date.now()}`;
  }

  /**
   * Prepare docker run command arguments
   */
  private prepareDockerArgs(): string[] {
    const args: string[] = ['run'];

    if (this.options.autoRemove !== false) {
      args.push('--rm');
    }

    // apply field mappings
    for (const [sourceKey, flag, type] of DOCKER_RUN_FIELD_MAPPINGS) {
      const value = this.options[sourceKey];
      if (value == null) continue;

      if (type === 'string') {
        args.push(flag, String(value));
      } else if (type === 'array' && Array.isArray(value)) {
        value.forEach(v => args.push(flag, v));
      } else if (type === 'boolean' && value) {
        args.push(flag);
      }
    }

    // stop timeout (special case - can be 0)
    if (this.options.stopTimeout !== undefined) {
      args.push('--stop-timeout', String(this.options.stopTimeout));
    }

    // environment variables
    if (this.options.env) {
      Object.entries(this.options.env).forEach(([key, value]) => {
        args.push('-e', `${key}=${value}`);
      });
    }

    args.push(this.options.image);

    if (this.options.command) {
      args.push(this.options.command);
    }

    if (this.options.arguments) {
      args.push(...this.options.arguments);
    }

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
      containerName: undefined,
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
      await this.initLogStreams();

      const imageName = this.options.image;
      if (this.options.pull !== 'never' && !(await isImagePulled(imageName))) {
        this.updateState({
          reason: `pull image: ${imageName}`,
        });
        await pullImage(imageName, {
          onStdErr: this.onStdErrData.bind(this),
          platform: this.options.platform,
        });
      }

      const args = this.prepareDockerArgs();

      this.process = spawn('docker', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      } as SpawnOptionsWithoutStdio);

      this.addProcessListeners();

      this.setTTLTimer();

      this.updateState({
        status: TaskStatus.STARTED,
        containerName: this.options.containerName,
        pid: this.process?.pid ?? -1,
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
      await new Promise<void>((resolve, reject) => {
        const stopProcess = spawn('docker', [
          'stop',
          this.options.containerName!,
        ]);
        stopProcess.on('exit', code => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Docker stop exited with code ${code}`));
          }
        });
        stopProcess.on('error', reject);
      });
    } catch (error) {
      this.onError(error as Error);
    } finally {
      await new Promise<void>(resolve => {
        this.process?.kill('SIGTERM' as NodeJS.Signals);
        this.process?.on('exit', () => {
          resolve();
        });
      });
    }
  }
}
