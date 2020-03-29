import { PubSub } from 'apollo-server-express'
import { User } from './db'

export type MyContext = {
  currentUser: User
  pubsub: PubSub
}
