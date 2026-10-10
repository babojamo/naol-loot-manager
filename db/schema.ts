import { sqliteTable, text, integer, primaryKey, uniqueIndex } from "drizzle-orm/sqlite-core";
export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(), email: text("email").notNull(), name: text("name").notNull(), createdAt: text("created_at").notNull(),
});
export const guilds = sqliteTable("guilds", {
  id: text("id").primaryKey(), name: text("name").notNull(), slug: text("slug").notNull().unique(),
  description: text("description").notNull().default(""), isPublic: integer("is_public").notNull().default(0), createdAt: text("created_at").notNull(),
});
export const guildUsers = sqliteTable("guild_users", {
  guildId: text("guild_id").notNull().references(() => guilds.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => accounts.id), role: text("role").notNull(), joinedAt: text("joined_at").notNull(),
}, (table) => [primaryKey({ columns: [table.guildId, table.userId] })]);
export const ledgers = sqliteTable("guild_ledgers", {
  guildId: text("guild_id").primaryKey().references(() => guilds.id, { onDelete: "cascade" }),
  payload: text("payload").notNull(), version: integer("version").notNull().default(0), updatedAt: text("updated_at").notNull(),
});
export const invites = sqliteTable("guild_invites", {
  id: text("id").primaryKey(), guildId: text("guild_id").notNull().references(() => guilds.id, { onDelete: "cascade" }),
  email: text("email").notNull(), role: text("role").notNull(), tokenHash: text("token_hash").notNull(),
  createdBy: text("created_by").notNull().references(() => accounts.id), expiresAt: text("expires_at").notNull(),
  usedBy: text("used_by"), createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("invite_token_unique").on(table.tokenHash)]);
