import { withFilter } from 'apollo-server-express'
import { DateTimeResolver, URLResolver } from 'graphql-scalars'
import { Message, Chat, pool } from '../db'
import { Resolvers } from '../types/graphql'
import { secret, expiration } from '../env'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { validateLength, validatePassword } from '../validators'
import sql from 'sql-template-strings'
import axios from 'axios'
import { RandomPhoto } from '../types/unsplash'
import { trackProvider } from '@safe-api/middleware'
import { resolve } from 'path'

const resolvers: Resolvers = {
  Date: DateTimeResolver,
  URL: URLResolver,

  Message: {
    createdAt(message) {
      console.log('-> Message createdAt')
      return new Date(message.created_at)
    },

    async chat(message, args, { context: { db } }) {
      console.log('-> Message chat')
      const { rows } = await db.query(sql`
        SELECT * FROM chats WHERE id = ${message.chat_id}
      `)
      return rows[0] || null
    },

    async sender(message, args, { db }) {
      console.log('-> Message sender')
      const { rows } = await db.query(sql`
        SELECT * FROM users WHERE id = ${message.sender_user_id}
      `)
      return rows[0] || null
    },

    async recipient(message, args, { db }) {
      console.log('-> Message recipient')
      const { rows } = await db.query(sql`
        SELECT users.* FROM users, chats_users
        WHERE chats_users.user_id != ${message.sender_user_id}
        AND chats_users.chat_id = ${message.chat_id}
      `)
      return rows[0] || null
    },

    isMine(message, args, { currentUser }) {
      console.log('-> Message isMine')
      return message.sender_user_id === currentUser.id
    },
  },

  Chat: {
    async name(chat, args, { currentUser, db }) {
      console.log('-> Chat name')
      if (!currentUser) return null

      const { rows } = await db.query(sql`
        SELECT users.* FROM users, chats_users
        WHERE users.id != ${currentUser.id}
        AND users.id = chats_users.user_id
        AND chats_users.chat_id = ${chat.id}`)

      const participant = rows[0]

      return participant ? participant.name : null
    },

    async picture(chat, args, { currentUser, db }) {
      console.log('-> Chat picture')
      if (!currentUser) return null

      const { rows } = await db.query(sql`
        SELECT users.* FROM users, chats_users
        WHERE users.id != ${currentUser.id}
        AND users.id = chats_users.user_id
        AND chats_users.chat_id = ${chat.id}`)

      const participant = rows[0]

      console.log('participant.picture', participant.picture)
      if (participant && participant.picture) {
        return participant.picture
      }

      interface RandomPhotoInput {
        query: string
        orientation: 'landscape' | 'portrait' | 'squarish'
      }

      const trackedRandomPhoto = await trackProvider(
        async ({ query, orientation }: RandomPhotoInput) =>
          (
            await axios.get<RandomPhoto>(
              'https://api.unsplash.com/photos/random',
              {
                params: {
                  query,
                  orientation,
                },
                headers: {
                  Authorization:
                    'Client-ID 4d048cfb4383b407eff92e4a2a5ec36c0a866be85e64caafa588c110efad350d',
                },
              }
            )
          ).data,
        {
          provider: 'Unsplash',
          method: 'RandomPhoto',
          location: resolve(__dirname, '../logs/main'),
        }
      )

      try {
        return (
          await trackedRandomPhoto({
            query: 'portrait',
            orientation: 'squarish',
          })
        ).urls.small
      } catch (err) {
        console.error('Cannot retrieve random photo:', err)
        return null
      }
    },

    async messages(chat, args, { db }) {
      console.log('-> Chat messages')
      const { rows } = await db.query(
        sql`SELECT * FROM messages WHERE chat_id = ${chat.id}`
      )

      return rows
    },

    async lastMessage(chat, args, { db }) {
      console.log('-> Chat lastMessage')
      const { rows } = await db.query(sql`
        SELECT * FROM messages 
        WHERE chat_id = ${chat.id} 
        ORDER BY created_at DESC 
        LIMIT 1`)

      return rows[0]
    },

    async participants(chat, args, { db }) {
      console.log('-> Chat participants')
      const { rows } = await db.query(sql`
        SELECT users.* FROM users, chats_users
        WHERE chats_users.chat_id = ${chat.id}
        AND chats_users.user_id = users.id
      `)

      return rows
    },
  },

  Query: {
    me(root, args, { currentUser }) {
      console.log('--> me')
      // console.log('> currentUser', currentUser)
      return currentUser || null
    },

    async chats(root, args, { currentUser, db }) {
      console.log('--> chats')
      // console.log('currentUser', currentUser)
      if (!currentUser) return []

      const { rows } = await db.query(sql`
        SELECT chats.* FROM chats, chats_users
        WHERE chats.id = chats_users.chat_id
        AND chats_users.user_id = ${currentUser.id}
      `)

      return rows
    },

    async chat(root, { chatId }, { currentUser, db }) {
      console.log('--> chat')
      if (!currentUser) return null

      const { rows } = await db.query(sql`
        SELECT chats.* FROM chats, chats_users
        WHERE chats_users.chat_id = ${chatId}
        AND chats.id = chats_users.chat_id
        AND chats_users.user_id = ${currentUser.id}
      `)

      return rows[0] ? rows[0] : null
    },

    async users(root, args, { currentUser, db }) {
      console.log('--> users')
      if (!currentUser) return []

      const { rows } = await db.query(sql`
        SELECT * FROM users WHERE users.id != ${currentUser.id}
      `)

      return rows
    },
  },

  Mutation: {
    async signIn(root, { username, password }, { db, res }) {
      const { rows } = await db.query(
        sql`SELECT * FROM users WHERE username = ${username}`
      )
      const user = rows[0]

      if (!user) {
        throw new Error('user not found')
      }

      const passwordsMatch = bcrypt.compareSync(password, user.password)

      if (!passwordsMatch) {
        throw new Error('password is incorrect')
      }

      const authToken = jwt.sign(username, secret)

      res.cookie('authToken', authToken, { maxAge: expiration })

      return user
    },

    async signUp(root, { name, username, password, passwordConfirm }, { db }) {
      console.log('--> signUp', name, username, password)
      validateLength('req.name', name, 3, 50)
      validateLength('req.username', username, 3, 18)
      validatePassword('req.password', password)

      if (password !== passwordConfirm) {
        throw Error("req.password and req.passwordConfirm don't match")
      }

      console.log('1')
      const existingUserQuery = await db.query(
        sql`SELECT * FROM users WHERE username = ${username}`
      )
      if (existingUserQuery.rows[0]) {
        throw Error('username already exists')
      }

      const passwordHash = bcrypt.hashSync(password, bcrypt.genSaltSync(8))

      const createdUserQuery = await db.query(sql`
        INSERT INTO users(password, picture, username, name)
        VALUES(${passwordHash}, '', ${username}, ${name})
        RETURNING *
      `)

      const user = createdUserQuery.rows[0]

      return user
    },

    async addMessage(root, { chatId, content }, { currentUser, pubsub, db }) {
      if (!currentUser) return null

      const { rows } = await db.query(sql`
        INSERT INTO messages(chat_id, sender_user_id, content)
        VALUES(${chatId}, ${currentUser.id}, ${content})
        RETURNING *
      `)

      const messageAdded = rows[0]

      pubsub.publish('messageAdded', {
        messageAdded,
      })

      return messageAdded
    },

    async addChat(root, { recipientId }, { currentUser, pubsub, db }) {
      if (!currentUser) return null

      const { rows } = await db.query(sql`
        SELECT chats.* FROM chats, (SELECT * FROM chats_users WHERE user_id = ${currentUser.id}) AS chats_of_current_user, chats_users
        WHERE chats_users.chat_id = chats_of_current_user.chat_id
        AND chats.id = chats_users.chat_id
        AND chats_users.user_id = ${recipientId}
      `)

      // If there is already a chat between these two users, return it
      if (rows[0]) {
        return rows[0]
      }

      try {
        await db.query('BEGIN')

        const { rows } = await db.query(sql`
            INSERT INTO chats
                DEFAULT
            VALUES
            RETURNING *
        `)

        const chatAdded = rows[0]

        await db.query(sql`
          INSERT INTO chats_users(chat_id, user_id)
          VALUES(${chatAdded.id}, ${currentUser.id})
        `)

        await db.query(sql`
          INSERT INTO chats_users(chat_id, user_id)
          VALUES(${chatAdded.id}, ${recipientId})
        `)

        await db.query('COMMIT')

        pubsub.publish('chatAdded', {
          chatAdded,
        })

        return chatAdded
      } catch (e) {
        await db.query('ROLLBACK')
        throw e
      }
    },

    async removeChat(root, { chatId }, { currentUser, pubsub, db }) {
      if (!currentUser) return null

      try {
        await db.query('BEGIN')

        const { rows } = await db.query(sql`
          SELECT chats.* FROM chats, chats_users
          WHERE id = ${chatId}
          AND chats.id = chats_users.chat_id
          AND chats_users.user_id = ${currentUser.id}
        `)

        const chat = rows[0]

        if (!chat) {
          await db.query('ROLLBACK')
          return null
        }

        await db.query(sql`
          DELETE FROM chats WHERE chats.id = ${chatId}
        `)

        pubsub.publish('chatRemoved', {
          chatRemoved: chat.id,
          targetChat: chat,
        })

        await db.query('COMMIT')

        return chatId
      } catch (e) {
        await db.query('ROLLBACK')
        throw e
      }
    },
  },

  Subscription: {
    messageAdded: {
      subscribe: withFilter(
        (root, args, { pubsub }) => pubsub.asyncIterator('messageAdded'),
        async (
          { messageAdded }: { messageAdded: Message },
          args,
          { currentUser }
        ) => {
          if (!currentUser) return false

          const { rows } = await pool.query(sql`
            SELECT * FROM chats_users 
            WHERE chat_id = ${messageAdded.chat_id} 
            AND user_id = ${currentUser.id}`)

          return !!rows.length
        }
      ),
    },

    chatAdded: {
      subscribe: withFilter(
        (root, args, { pubsub }) => pubsub.asyncIterator('chatAdded'),
        async ({ chatAdded }: { chatAdded: Chat }, args, { currentUser }) => {
          if (!currentUser) return false

          const { rows } = await pool.query(sql`
            SELECT * FROM chats_users 
            WHERE chat_id = ${chatAdded.id} 
            AND user_id = ${currentUser.id}`)

          return !!rows.length
        }
      ),
    },

    chatRemoved: {
      subscribe: withFilter(
        (root, args, { pubsub }) => pubsub.asyncIterator('chatRemoved'),
        async ({ targetChat }: { targetChat: Chat }, args, { currentUser }) => {
          if (!currentUser) return false

          const { rows } = await pool.query(sql`
            SELECT * FROM chats_users 
            WHERE chat_id = ${targetChat.id} 
            AND user_id = ${currentUser.id}`)

          return !!rows.length
        }
      ),
    },
  },
}

export default resolvers
