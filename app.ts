import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { origin } from './env'

export const app = express()

app.use(cors({ credentials: true, origin }))

app.use(express.json())
app.use(cookieParser())

app.get('/_ping', (req, res) => {
  res.send('pong')
})
