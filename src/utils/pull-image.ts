import { exec } from 'node:child_process';

interface PullImageOptions {
  onStdOut?: (output: Buffer) => void;
  onStdErr?: (output: Buffer) => void;
  platform?: string;
}

/**
 * Pull a Docker image
 * @param imageName
 * @param options
 */
export async function pullImage(
  imageName: string,
  options: PullImageOptions = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = exec(
      `docker pull ${options.platform ? `--platform ${options.platform} ` : ''}${imageName}`
    );

    if (child.stdout && options.onStdOut) {
      child.stdout.on('data', data => {
        options.onStdOut!(data.toString());
      });
    }

    if (child.stderr && options.onStdErr) {
      child.stderr.on('data', data => {
        options.onStdErr!(data.toString());
      });
    }

    child.on('exit', (code: number | null) => {
      if (code === 0) {
        resolve();
      } else {
        reject({
          code,
          message: code === null ? '' : `docker pull exited with code ${code}`,
        });
      }
    });

    child.on('error', (error: Error) => {
      reject({ message: error.message, code: -1 });
    });
  });
}
