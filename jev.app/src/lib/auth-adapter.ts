import crypto from "crypto"
import type { Adapter, AdapterAccount, AdapterUser, VerificationToken } from "next-auth/adapters"
import pool from "./db"

export function MySqlAdapter(): Adapter {
  return {
    async createUser(user) {
      const id = crypto.randomUUID()
      await pool.query(
        "INSERT INTO users (id, name, email, email_verified, image) VALUES (?, ?, ?, ?, ?)",
        [id, user.name ?? null, user.email, user.emailVerified ?? null, user.image ?? null],
      )
      return { ...user, id } as AdapterUser
    },

    async getUser(id) {
      const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [id])
      const user = (rows as Record<string, unknown>[])[0]
      if (!user) return null
      return mapUser(user)
    },

    async getUserByEmail(email) {
      const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email])
      const user = (rows as Record<string, unknown>[])[0]
      if (!user) return null
      return mapUser(user)
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const [rows] = await pool.query(
        `SELECT u.* FROM users u
         JOIN accounts a ON u.id = a.user_id
         WHERE a.provider = ? AND a.provider_account_id = ?`,
        [provider, providerAccountId],
      )
      const user = (rows as Record<string, unknown>[])[0]
      if (!user) return null
      return mapUser(user)
    },

    async updateUser(user) {
      const fields: string[] = []
      const values: unknown[] = []
      if (user.name !== undefined) { fields.push("name = ?"); values.push(user.name) }
      if (user.email !== undefined) { fields.push("email = ?"); values.push(user.email) }
      if (user.emailVerified !== undefined) { fields.push("email_verified = ?"); values.push(user.emailVerified) }
      if (user.image !== undefined) { fields.push("image = ?"); values.push(user.image) }
      if (fields.length > 0) {
        values.push(user.id)
        await pool.query(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, values)
      }
      const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [user.id])
      return mapUser((rows as Record<string, unknown>[])[0])
    },

    async deleteUser(userId) {
      await pool.query("DELETE FROM users WHERE id = ?", [userId])
    },

    async linkAccount(account) {
      const id = crypto.randomUUID()
      await pool.query(
        `INSERT INTO accounts (id, user_id, type, provider, provider_account_id,
         refresh_token, access_token, expires_at, token_type, scope, id_token)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, account.userId, account.type, account.provider, account.providerAccountId,
          account.refresh_token ?? null, account.access_token ?? null,
          account.expires_at ?? null, account.token_type ?? null,
          account.scope ?? null, account.id_token ?? null,
        ],
      )
      return account as AdapterAccount
    },

    async unlinkAccount({ provider, providerAccountId }) {
      await pool.query(
        "DELETE FROM accounts WHERE provider = ? AND provider_account_id = ?",
        [provider, providerAccountId],
      )
    },

    async createVerificationToken(token) {
      await pool.query(
        "INSERT INTO verification_tokens (identifier, token, expires) VALUES (?, ?, ?)",
        [token.identifier, token.token, token.expires],
      )
      return token as VerificationToken
    },

    async useVerificationToken({ identifier, token }) {
      const [rows] = await pool.query(
        "SELECT * FROM verification_tokens WHERE identifier = ? AND token = ?",
        [identifier, token],
      )
      const row = (rows as Record<string, unknown>[])[0]
      if (!row) return null
      await pool.query(
        "DELETE FROM verification_tokens WHERE identifier = ? AND token = ?",
        [identifier, token],
      )
      return {
        identifier: row.identifier as string,
        token: row.token as string,
        expires: new Date(row.expires as string),
      }
    },
  }
}

function mapUser(row: Record<string, unknown>): AdapterUser {
  return {
    id: row.id as string,
    name: (row.name as string) ?? null,
    email: row.email as string,
    emailVerified: row.email_verified ? new Date(row.email_verified as string) : null,
    image: (row.image as string) ?? null,
  }
}
