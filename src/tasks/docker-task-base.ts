import { ChildProcessWithoutNullStreams } from 'node:child_process';
import { createWriteStream, WriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { setTimeout } from 'node:timers';
import * as Runium from '@runium/types-plugin';

export const SILENT_EXIT_CODE = -1;

const MAX_LISTENERS_COUNT = 50;

const { TaskStatus, TaskEvent } = runium.enum;

/**
 * Docker task base options
 */
export interface DockerTaskBaseOptions {
  ttl?: number;
  log?: {
    stdout?: string | null;
    stderr?: string | null;
  };
}

/**
 * Docker task base state
 */
export interface DockerTaskBaseState extends Runium.RuniumTaskState {
  pid?: number;
}

/**
 * Docker task base class
 */
export abstract class DockerTaskBase<
  Options extends DockerTaskBaseOptions = DockerTaskBaseOptions,
  State extends DockerTaskBaseState = DockerTaskBaseState,
> extends runium.class.RuniumTask<Options, State> {
  protected correctExitCodes: number[] = [];

  protected state: State = {
    status: TaskStatus.IDLE,
    timestamp: Date.now(),
    iteration: 0,
    pid: -1,
  } as State;

  protected process: ChildProcessWithoutNullStreams | null = null;
  protected stdoutStream: WriteStream | null = null;
  protected stderrStream: WriteStream | null = null;
  protected ttlTimer: NodeJS.Timeout | null = null;

  constructor(protected readonly options: Options) {
    super(options);
    this.setMaxListeners(MAX_LISTENERS_COUNT);
  }

  /**
   * Get task state
   */
  public getState(): State {
    return { ...this.state };
  }

  /**
   * Get task options
   */
  public getOptions(): Options {
    return { ...this.options };
  }

  /**
   * Check if task can start
   */
  protected canStart(): boolean {
    const { status } = this.state;
    return (
      status !== TaskStatus.STARTED &&
      status !== TaskStatus.STARTING &&
      status !== TaskStatus.STOPPING
    );
  }

  /**
   * Check if task can stop
   */
  protected canStop(): boolean {
    const { status } = this.state;
    return status === TaskStatus.STARTED || status === TaskStatus.STARTING;
  }

  /**
   * Start task
   */
  abstract start(): Promise<void>;

  /**
   * Stop task
   * @param reason
   */
  abstract stop(reason: string): Promise<void>;

  /**
   * Restart task
   */
  async restart(): Promise<void> {
    await this.stop('restart');
    await this.start();
  }

  /**
   * Initialize log streams
   */
  protected async initLogStreams(): Promise<void> {
    const { stdout = null, stderr = null } = this.options.log || {};
    if (stdout) {
      const stdOutPath = resolve(stdout);
      await mkdir(dirname(stdOutPath), { recursive: true });
      this.stdoutStream = createWriteStream(stdout, {
        flags: this.state.iteration === 1 ? 'w' : 'a',
      });
    }
    if (stderr) {
      const stdErrPath = resolve(stderr);
      await mkdir(dirname(stdErrPath), { recursive: true });
      this.stderrStream = createWriteStream(stderr, {
        flags: this.state.iteration === 1 ? 'w' : 'a',
      });
    }
  }

  /**
   * Set TTL timer
   */
  protected setTTLTimer(): void {
    const { ttl } = this.options;
    if (ttl && this.process) {
      this.ttlTimer = setTimeout(() => {
        this.stop('ttl');
      }, ttl);
    }
  }

  /**
   * Add process listeners
   */
  protected addProcessListeners(): void {
    if (!this.process) return;

    this.process.stdout?.on('data', (data: Buffer) => this.onStdOutData(data));

    this.process.stderr?.on('data', (data: Buffer) => this.onStdErrData(data));

    this.process.on('exit', (code: number | null) => this.onExit(code));

    this.process.on('error', (error: Error) => this.onError(error));
  }

  /**
   * On standard output data
   */
  protected onStdOutData(data: Buffer): void {
    const output = data.toString();
    this.emit(TaskEvent.STDOUT, output);
    if (this.stdoutStream) {
      this.stdoutStream!.write(output);
    }
  }

  /**
   * On standard error data
   */
  protected onStdErrData(data: Buffer): void {
    const output = data.toString();
    this.emit(TaskEvent.STDERR, output);
    if (this.stderrStream) {
      this.stderrStream!.write(output);
    }
  }

  /**
   * On exit
   * @param code
   */
  protected onExit(code: number | null): void {
    const exitCode =
      code !== null && !this.correctExitCodes.includes(code)
        ? code
        : SILENT_EXIT_CODE;

    this.updateState({
      status:
        exitCode === 0
          ? TaskStatus.COMPLETED
          : exitCode === SILENT_EXIT_CODE
            ? TaskStatus.STOPPED
            : TaskStatus.FAILED,
      exitCode,
    } as State);

    this.cleanup();
  }

  /**
   * On error
   * @param error
   * @param code
   */
  protected onError(error: Error, code?: number): void {
    const errorCode = code ?? (error as { code?: number })?.code ?? null;
    this.updateState({
      status: errorCode === null ? TaskStatus.STOPPED : TaskStatus.FAILED,
      reason: error.message || (errorCode ?? ''),
    } as State);

    this.cleanup();
  }

  /**
   * Update task state
   */
  protected updateState(state: Partial<State>): void {
    const newState = { ...this.state, ...state, timestamp: Date.now() };
    this.state = Object.fromEntries(
      Object.entries(newState).filter(([_, value]) => {
        return value !== undefined;
      })
    ) as unknown as State;
    this.emit(TaskEvent.STATE_CHANGE, this.getState());
    this.emit(this.state.status, this.getState());
  }

  /**
   * Cleanup
   */
  protected cleanup(): void {
    if (this.ttlTimer) {
      clearTimeout(this.ttlTimer);
      this.ttlTimer = null;
    }

    if (this.process) {
      this.process.removeAllListeners();
      this.process.stdout?.removeAllListeners();
      this.process.stderr?.removeAllListeners();
      this.process = null;
    }

    if (this.stdoutStream) {
      this.stdoutStream.end();
      this.stdoutStream = null;
    }

    if (this.stderrStream) {
      this.stderrStream.end();
      this.stderrStream = null;
    }
  }
}
