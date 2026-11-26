import { DataSource, type DataSourceOptions } from "typeorm";
import { createEntitySchemas } from "../entity/schema.ts";
import type { Schema } from "./schema/model.ts";

export function createEntityDataSource(schema: Schema, options: DataSourceOptions) {
	return new DataSource({
		...options,
		entities: createEntitySchemas(schema),
		synchronize: false,
		migrationsRun: false,
		dropSchema: false,
		logging: false,
	});
}
