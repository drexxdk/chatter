import type { Server as HttpServer } from 'http'
import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'

import { env } from './env.js'
import { pubClient, subClient } from './redis.js'

export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: env.WEB_ORIGIN, credentials: true },
  })

  io.adapter(createAdapter(pubClient, subClient))

  io.on('connection', (socket) => {
    console.log(`socket connected: ${socket.id}`)

    socket.on('disconnect', (reason) => {
      console.log(`socket disconnected: ${socket.id} (${reason})`)
    })
  })

  return io
}
