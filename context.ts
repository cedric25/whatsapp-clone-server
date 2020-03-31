import { PubSub } from 'apollo-server-express'
import { User } from './db'
import { Response } from 'express'
import { PoolClient } from 'pg'
import { GraphQLRequestContext } from 'apollo-server-types'

// export type MyContext = {
//   currentUser: User
//   pubsub: PubSub
//   res: Response
//   db: PoolClient
// }

// export type MyContext = GraphQLRequestContext & {
//   currentUser: User
//   pubsub: PubSub
//   res: Response
//   db: PoolClient
// }

// type MyMyContext = {
//   currentUser: User
//   pubsub: PubSub
//   res: Response
//   db: PoolClient
// }
//
// export interface MyContext extends GraphQLRequestContext<Object> {
//   context: MyMyContext
// }
