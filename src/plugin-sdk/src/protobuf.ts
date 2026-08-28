import {
  create,
  fromBinary,
  toBinary,
  type DescMessage,
  type DescMethodUnary,
  type DescService,
  type MessageInitShape,
  type MessageShape,
} from '@bufbuild/protobuf'
import type { PluginCommunicationApi, PluginNativeBackendApi } from './types'

const RESERVED_METHOD_NAMES = new Set(['constructor', 'prototype', '__proto__', 'then'])

type UnaryClientMethod<M> =
  M extends DescMethodUnary<infer I extends DescMessage, infer O extends DescMessage>
    ? (request?: MessageInitShape<I>) => Promise<MessageShape<O>>
    : never

type UnaryImplementationMethod<M> =
  M extends DescMethodUnary<infer I extends DescMessage, infer O extends DescMessage>
    ? (request: MessageShape<I>) => MessageInitShape<O> | Promise<MessageInitShape<O>>
    : never

export type PluginServiceClient<S extends DescService> = {
  readonly [P in keyof S['method']]: UnaryClientMethod<S['method'][P]>
}

export type PluginServiceImplementation<S extends DescService> = {
  [P in keyof S['method']]: UnaryImplementationMethod<S['method'][P]>
}

/** Expose a generated unary Protobuf service over Scalpel's object transport. */
export function exposePluginService<S extends DescService>(
  plugins: PluginCommunicationApi,
  service: S,
  implementation: PluginServiceImplementation<S>,
): void {
  const serviceMethods = unaryMethods(service)
  for (const method of serviceMethods) {
    const handler = implementation[method.localName as keyof PluginServiceImplementation<S>]
    if (!Object.prototype.hasOwnProperty.call(implementation, method.localName) || typeof handler !== 'function') {
      throw new Error(`plugin API method is not implemented: ${methodPath(service, method.name)}`)
    }
  }
  const methods = new Map(serviceMethods.map((method) => [methodPath(service, method.name), method]))

  plugins.expose(service.typeName, async (path, params) => {
    const method = methods.get(path)
    if (!method) throw new Error(`unknown plugin API method: ${path}`)
    const handler = implementation[method.localName as keyof PluginServiceImplementation<S>]
    const request = create(method.input, params == null ? {} : (params as MessageInitShape<DescMessage>))
    const response = await (handler as (value: unknown) => unknown | Promise<unknown>)(request)
    return create(method.output, response as MessageInitShape<DescMessage>)
  })
}

/** Return a typed client for an optional declared plugin dependency. */
export function getPluginServiceClient<S extends DescService>(
  plugins: PluginCommunicationApi,
  pluginId: string,
  service: S,
): PluginServiceClient<S> | null {
  const transport = plugins.get(pluginId, service.typeName)
  if (!transport) return null
  return createServiceClient(service, async (path, _method, request) => transport.call(path, request))
}

/** Return a typed client for a required declared plugin dependency. */
export function createPluginServiceClient<S extends DescService>(
  plugins: PluginCommunicationApi,
  pluginId: string,
  service: S,
): PluginServiceClient<S> {
  const client = getPluginServiceClient(plugins, pluginId, service)
  if (!client) throw new Error(`required plugin API "${pluginId}" is unavailable`)
  return client
}

/** Return a typed client that serializes a generated service over the owning native backend. */
export function createNativeServiceClient<S extends DescService>(
  native: PluginNativeBackendApi,
  service: S,
): PluginServiceClient<S> {
  return createServiceClient(service, async (path, method, request) => {
    const response = await native.call(path, toBinary(method.input, request))
    return fromBinary(method.output, response)
  })
}

function createServiceClient<S extends DescService>(
  service: S,
  call: (path: string, method: DescMethodUnary, request: MessageShape<DescMessage>) => Promise<unknown>,
): PluginServiceClient<S> {
  const client: Record<string, (request?: MessageInitShape<DescMessage>) => Promise<unknown>> = Object.create(null)
  for (const method of unaryMethods(service)) {
    client[method.localName] = async (request = {}) => {
      const input = create(method.input, request)
      const output = await call(methodPath(service, method.name), method, input)
      return create(method.output, output as MessageInitShape<DescMessage>)
    }
  }
  return client as PluginServiceClient<S>
}

function unaryMethods(service: DescService): DescMethodUnary[] {
  const streaming = service.methods.find((method) => method.methodKind !== 'unary')
  if (streaming) throw new Error(`streaming Protobuf method is unsupported: ${service.typeName}.${streaming.name}`)
  const reserved = service.methods.find((method) => RESERVED_METHOD_NAMES.has(method.localName))
  if (reserved) throw new Error(`reserved Protobuf method name: ${service.typeName}.${reserved.name}`)
  return service.methods as DescMethodUnary[]
}

function methodPath(service: DescService, methodName: string): string {
  return `/${service.typeName}/${methodName}`
}
