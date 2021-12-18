'use strict'

const Fastify = require('fastify')
const { test, afterEach } = require('tap')
const fastifyRedis = require('fastify-redis')
const fs = require('fs')
const util = require('util')
const fastifyPubsub = require('..')


const boot = async (options={}) => {
  const fastify = Fastify()
  // used to publish messages
  fastify.register(fastifyRedis, {
    config: {
      host: '127.0.0.1'
    }
  })
  if (options.url) {
    fastify.register(fastifyPubsub, {
      url: options.url
    })
  } else if (options.channels) {
    fastify.register(fastifyPubsub, {
      config: {
        host: '127.0.0.1',
      },
      channels: options.channels,
      subAction: options.subAction
    })
  } else {
    fastify.register(fastifyPubsub, {
      config: {
        host: '127.0.0.1'
      }
    })
  }

  await fastify.ready()
  return fastify
}

const writeFile = (logFile, d) => {
  logFile.write(`${util.format(d)}\n`)
}

const readFile = () => {
  const data = fs.readFileSync(__dirname + '/debug.log', 'utf8')
  return data
}

const delay = (ms) => {
  return new Promise((res) => setTimeout(res, ms))
}

afterEach(async () => {
  const fastify = Fastify()
  fastify.register(fastifyRedis, {
    host: '127.0.0.1'
  })
  await fastify.ready()
  await fastify.redis.flushall()
  await fastify.close()
})

test('Registering pluging provides .subscribe and .endSubscription decorators with no subscribers', async (t) => {
  const fastify = await boot()
  t.ok(fastify.subscribe)
  t.ok(fastify.endSubscription)
  t.notOk(fastify.subscribers)

  await fastify.close()
})

test('Registering pluging with url', async (t) => {
  const fastify = await boot({ url: 'redis://127.0.0.1' })
  t.ok(fastify.subscribe)
  t.ok(fastify.endSubscription)
  t.notOk(fastify.subscribers)

  await fastify.close()
})

test('Fails to register if missing config and url options', async (t) => {
  const fastify = Fastify()
  const testError = new Error('Must send redis connect "url" string OR connection "config" object') 
  try {
    await fastify.register(fastifyPubsub, {})
  } catch (err) {
    t.same(err, testError)
  }
  t.notOk(fastify.subscribe)
  t.notOk(fastify.endSubscription)
})

test('Fails to register if both config and url options are passed', async (t) => {
  const fastify = Fastify()
  const testError = new Error('Cannot send both "url" and "config" for Redis connection, pick one')
  try {
    await fastify.register(fastifyPubsub, {
      url: 'redis://127.0.0.1',
      config: {
        host: '127.0.0.1'
      }
    })
  } catch (err) {
    t.same(err, testError)
  }
  t.notOk(fastify.subscribe)
  t.notOk(fastify.endSubscription)
})

test('Register default subscriber with debug action on plugin initialize', async (t) => {
  const fastify = await boot({
    channels: ['ch1']
  })
  t.ok(fastify.subscribe)
  t.ok(fastify.endSubscription)
  t.ok(fastify.subscribers)
  t.equal(Object.keys(fastify.subscribers).length, 1)

  await fastify.redis.publish('ch1', 'test message')

  await fastify.close()
})

test('Register default subscriber with new action on plugin initialize', async (t) => {
  const logFile = fs.createWriteStream(__dirname + '/debug.log', { flags : 'w' });
  const fastify = await boot({
    channels: ['ch1'],
    subAction: (ch, msg) => {
      writeFile(logFile, `${ch}: ${msg}`)
    }
  })
  t.ok(fastify.subscribe)
  t.ok(fastify.endSubscription)
  t.ok(fastify.subscribers)
  t.equal(Object.keys(fastify.subscribers).length, 1)

  await fastify.redis.publish('ch1', 'test message')
  await delay(1000)
  const data = readFile()

  t.same(data, 'ch1: test message\n')

  await fastify.close()
})

test('Register default subscriber with incorrect subAction fails', async (t) => {
  const fastify = Fastify()
  const testError = new Error('Must register a function for the subAction if overriding the default')
  try {
    await fastify.register(fastifyPubsub, {
      channels: ['ch1'],
      subAction: 'test',
      config: {
        host: '127.0.0.1'
      }
    })
  } catch (err) {
    t.same(err, testError)
  }
})

test('Register/remove subscriber on demand', async (t) => {
  //No subscribers to start
  const fastify = await boot()
  t.notOk(fastify.subscribers)

  // 1 subscriber
  const name = await fastify.subscribe(null, 'ch1')
  t.equal(Object.keys(fastify.subscribers).length, 1)
  t.same(name, Object.keys(fastify.subscribers)[0])

  // 0 subscriber
  await fastify.endSubscription(name)
  t.equal(Object.keys(fastify.subscribers).length, 0)

  await fastify.close()
})

test('Registered subscriber works on multiple channels', async (t) => {
  const fastify = await boot()
  t.notOk(fastify.subscribers)

  const logFile = fs.createWriteStream(__dirname + '/debug.log', { flags : 'w' });
  const subAction = (ch, msg) => {
    writeFile(logFile, `${ch}: ${msg}`)
  }
  const name = await fastify.subscribe(subAction, 'ch1', 'ch2')
  t.equal(Object.keys(fastify.subscribers).length, 1)
  t.same(name, Object.keys(fastify.subscribers)[0])

  await fastify.redis.publish('ch1', 'test message on ch1')
  await fastify.redis.publish('ch2', 'test message on ch2')
  await delay(1000)
  const data = readFile()

  t.same(data, 'ch1: test message on ch1\nch2: test message on ch2\n')

  await fastify.close()
})

test('Registering new subscriber without a channel fails', async (t) => {
  const fastify = await boot()
  const testError = new Error('Must include at least one channel in subscribe call')
  try {
    await fastify.subscribe(null)
  } catch (err) {
    t.same(err, testError)
  }

  await fastify.close()
})

test('Registering new subscriber without function for subAction fails', async (t) => {
  const fastify = await boot()
  const testError = new Error('Must register a function for the subAction if overriding the default')
  try {
    await fastify.subscribe('test', 'ch1')
  } catch (err) {
    t.same(err, testError)
  }

  await fastify.close()
})

test('Register default subscriber on new namespace has decorators under that namespace', async (t) => {
  const fastify = Fastify()
  await fastify.register(fastifyPubsub, {
    channels: ['ch1'],
    namespace: 'test',
    config: {
      host: '127.0.0.1'
    }
  })
  t.ok(fastify.test.subscribe)
  t.ok(fastify.test.endSubscription)
  t.notOk(fastify.subscribe)
  t.notOk(fastify.endSubscription)

  await fastify.close()
})

test('Add/remove subscriber under new namespace', async (t) => {
  const fastify = Fastify()
  await fastify.register(fastifyPubsub, {
    channels: ['ch1'],
    namespace: 'test',
    config: {
      host: '127.0.0.1'
    }
  })
  t.ok(fastify.test.subscribe)
  t.ok(fastify.test.endSubscription)
  t.notOk(fastify.subscribe)
  t.notOk(fastify.endSubscription)

  const name = await fastify.test.subscribe(null, 'ch1', 'ch2')
  t.equal(Object.keys(fastify.subscribers).length, 2)
  t.same(name, Object.keys(fastify.subscribers)[1])

  await fastify.test.endSubscription(name)
  t.equal(Object.keys(fastify.subscribers).length, 1)

  await fastify.close()
})

test('Colliding namespace fails', async (t) => {
  const fastify = Fastify()
  const testError = new Error('Namespace is already taken, choose another for this pubsub plugin')
  await fastify.register(fastifyPubsub, {
    channels: ['ch1'],
    namespace: 'test',
    config: {
      host: '127.0.0.1'
    }
  })

  try {
    await fastify.register(fastifyPubsub, {
      channels: ['ch1'],
      namespace: 'test',
      config: {
        host: '127.0.0.1'
      }
    })
  } catch (err) {
    t.same(err, testError)
  }

  await fastify.close()
})
