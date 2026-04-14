let startedProjectName = '';

/**
 * Get the name of the project that was started
 */
export function getStartedProjectName(): string {
  return startedProjectName;
}

/**
 * Set the name of the project that would be started
 * @param name
 */
export function setStartedProjectName(name: string): void {
  startedProjectName = name;
}
