import type { DatabaseSync } from "node:sqlite";
import type { ServerConfig } from "../config.ts";
import type { StoreDatabase } from "./database.ts";
import { createSqliteDatabase } from "./sqlite.ts";

export type DatabaseConnection = StoreDatabase | DatabaseSync;

export async function openDatabaseConnection(
	config: Pick<ServerConfig, "database" | "dataDir">,
): Promise<StoreDatabase> {
	if (config.database.driver === "sqlite") {
		const { openDatabase } = await import("./db.ts");
		const connection = await openDatabase(config.dataDir);
		try {
			const database = createSqliteDatabase(connection);
			await database.initializeEntities();
			return database;
		} catch (error) {
			if (connection.isOpen) connection.close();
			throw error;
		}
	}
	if (config.database.driver === "postgres") {
		const { connectPostgres } = await import("./postgres.ts");
		return connectPostgres(config.database);
	}
	const { connectMysql } = await import("./mysql.ts");
	return connectMysql(config.database);
}
