import { Plugin } from '@runium/types-plugin';
import { setStartedProjectName } from './state/project.js';
import { DockerTask } from './tasks/docker-task.js';
import { DockerComposeTask } from './tasks/docker-compose-task.js';
import { getDockerTaskProjectSchema } from './validation/docker-task-project-schema.js';
import { getDockerComposeTaskProjectSchema } from './validation/docker-compose-task-project-schema.js';

export default function (): Plugin {
  return {
    name: 'docker',
    hooks: {
      project: {
        async beforeStart({ path, name }) {
          setStartedProjectName(name || runium.utils.pathToId(path));
        },
      },
    },
    project: {
      tasks: {
        docker: DockerTask,
        'docker-compose': DockerComposeTask,
      },
      validationSchema: {
        tasks: {
          Docker_DockerTask: getDockerTaskProjectSchema(),
          Docker_DockerComposeTask: getDockerComposeTaskProjectSchema(),
        },
      },
    },
  } as Plugin;
}
