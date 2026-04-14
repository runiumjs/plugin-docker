import { ProjectSchemaExtensionTask } from '@runium/types-plugin';

export function getDockerTaskProjectSchema(): ProjectSchemaExtensionTask {
  return {
    type: 'docker',
    options: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
        },
        containerName: {
          type: 'string',
        },
        command: {
          type: 'string',
        },
        arguments: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
        ports: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
        volumes: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
        env: {
          $ref: '#/$defs/Runium_Env',
        },
        network: {
          type: 'string',
        },
        autoRemove: {
          type: 'boolean',
        },
        user: {
          type: 'string',
        },
        workdir: {
          type: 'string',
        },
        entrypoint: {
          type: 'string',
        },
        privileged: {
          type: 'boolean',
        },
        restart: {
          type: 'string',
          enum: ['no', 'always', 'on-failure', 'unless-stopped'],
        },
        memory: {
          type: 'string',
        },
        cpus: {
          type: 'string',
        },
        hostname: {
          type: 'string',
        },
        envFile: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
        stopSignal: {
          type: 'string',
        },
        stopTimeout: {
          type: 'number',
        },
        pull: {
          type: 'string',
          enum: ['always', 'missing', 'never'],
        },
        platform: {
          type: 'string',
        },
        ttl: {
          type: 'number',
        },
        log: {
          $ref: '#/$defs/Runium_TaskLog',
        },
      },
      required: ['image'],
      additionalProperties: false,
    },
  };
}
