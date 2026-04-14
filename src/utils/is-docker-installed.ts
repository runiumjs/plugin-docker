import { execAsync } from './exec-async.js';

/**
 * Check if Docker is installed
 */
export async function isDockerInstalled(): Promise<boolean> {
  try {
    await execAsync('docker --version');
    return true;
  } catch {
    return false;
  }
}
