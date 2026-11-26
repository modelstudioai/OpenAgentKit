import type { EntityManager, ObjectLiteral, QueryDeepPartialEntity } from "typeorm";

export type SqlValue = string | number | bigint | Uint8Array | null;
type EntityClass<T> = new () => T;
export type EntityWork<T> = (manager: EntityManager) => Promise<T>;

/** 各业务域共享的数据库访问接口，同时作为 Nest 注入令牌。 */
export abstract class StoreDatabase {
	abstract readonly dialect: "sqlite" | "mysql" | "postgres";
	abstract readonly read: <T>(work: EntityWork<T>) => Promise<T>;
	abstract readonly write: <T>(work: EntityWork<T>) => Promise<T>;
	abstract readonly transaction: <T>(work: () => Promise<T>) => Promise<T>;
	abstract readonly insertEntityIfAbsent: <E extends ObjectLiteral>(
		entity: EntityClass<E>,
		values: QueryDeepPartialEntity<E>,
		conflictColumns?: (keyof E & string)[],
	) => Promise<boolean>;
	abstract readonly close: () => Promise<void>;
}
