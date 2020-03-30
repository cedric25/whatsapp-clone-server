import { PubSub } from 'apollo-server-express'
import { User } from './db'
import { Response } from 'express'
import { PoolClient } from 'pg'

export type MyContext = {
  currentUser: User
  pubsub: PubSub
  res: Response
  db: PoolClient
}
