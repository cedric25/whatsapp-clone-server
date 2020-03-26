import { createTestClient } from 'apollo-server-testing';
import { ApolloServer, gql } from 'apollo-server-express';
import schema from '../../schema';

// jest.spyOn(Date, 'now')
//   .mockImplementation(() => new Date('2020-03-26T10:00:00.000Z').getTime())

describe('Query.chats', () => {

  it('should fetch all chats', async () => {
    const server = new ApolloServer({ schema });

    console.log('Date.now()', Date.now())

    const { query } = createTestClient(server);

    const res = await query({
      query: gql`
        query GetChats {
          chats {
            id
            name
            picture
            lastMessage {
              id
              content
              createdAt
            }
          }
        }
      `,
    });

    expect(res.data).toBeDefined();
    expect(res.errors).toBeUndefined();
    expect(res.data).toMatchSnapshot();
  });
});
