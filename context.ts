import { PubSub } from 'apollo-server-express'
import { User } from './db'
import { Response } from 'express'

export type MyContext = {
  currentUser: User
  pubsub: PubSub
  res: Response
}
