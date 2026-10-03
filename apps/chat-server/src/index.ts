import http from 'http'
import express from 'express'
import cors from 'cors'

import { env } from './env.js'
import { createSocketServer } from './socket.js'
import { startPublicRoomsSync, getCachedPublicRooms } from './rooms.js'
import { startBansSync } from './bans.js'

const app = express()
app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }))

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.get('/rooms', async (_req, res) => {
  res.json(await getCachedPublicRooms())
})

const httpServer = http.createServer(app)
createSocketServer(httpServer)

startPublicRoomsSync()
startBansSync()

httpServer.listen(env.PORT, () => {
  console.log(`chat-server listening on port ${env.PORT}`)
})
