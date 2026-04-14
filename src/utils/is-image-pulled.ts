import { execAsync } from './exec-async.js';

/**
 * Check if an image is already pulled locally
 * @param imageName
 */
export async function isImagePulled(imageName: string): Promise<boolean> {
  try {
    await execAsync(`docker image inspect ${imageName}`);
    return true;
  } catch {
    return false;
  }
}
