import "reflect-metadata";
import { type DynamicModule, type INestApplication, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import { SwaggerModule } from "@nestjs/swagger";
import type { ServerConfig } from "../config.ts";
import { installHttpBoundary } from "../http/boundary.ts";
import { generateOpenApi } from "../http/openapi.ts";
import { ResourceDraftService } from "../service/admin/resource-draft/resource-drafts.ts";
import { MemberAuthService } from "../service/shared/member-auth.ts";
import { OidcAuthService } from "../service/shared/oidc-auth.ts";
import { SessionService } from "../service/shared/session/sessions.ts";
import { KIT_CONFIG, KIT_METRICS, KIT_RATE_LIMITER } from "../utils/injection-tokens.ts";
import type { Metrics } from "../utils/metrics.ts";
import type { RateLimiter } from "../utils/rate-limit.ts";
import { httpModules, publicControllers, routeControllers } from "./http-controllers.ts";

export async function createHttpApplication(
	runtime: DynamicModule,
	close?: () => Promise<void>,
): Promise<INestApplication> {
	const shutdown = new AbortController();
	let sessions: SessionService | undefined;
	@Module({
		imports: [runtime, ...httpModules],
		controllers: publicControllers,
		providers: [
			{
				provide: Symbol("KitHttpShutdown"),
				useValue: {
					beforeApplicationShutdown() {
						shutdown.abort();
					},
					async onApplicationShutdown() {
						try {
							await sessions?.closeStreams();
						} finally {
							await close?.();
						}
					},
				},
			},
		],
	})
	class AppModule {}

	let app: INestApplication | undefined;
	try {
		const adapter = new ExpressAdapter();
		adapter.getInstance().set("case sensitive routing", true);
		adapter.getInstance().set("strict routing", true);
		adapter.getInstance().disable("x-powered-by");
		app = await NestFactory.create(AppModule, adapter, { bodyParser: false, abortOnError: false, logger: false });
		sessions = app.get(SessionService);
		installHttpBoundary(
			app,
			{
				config: app.get<ServerConfig>(KIT_CONFIG),
				memberAuth: app.get(MemberAuthService),
				oidcAuth: app.get(OidcAuthService),
				resourceDrafts: app.get(ResourceDraftService),
				metrics: app.get<Metrics>(KIT_METRICS),
				limiter: app.get<RateLimiter>(KIT_RATE_LIMITER),
			},
			shutdown.signal,
		);
		SwaggerModule.setup("docs", app, generateOpenApi(routeControllers), {
			ui: false,
			raw: ["json"],
			jsonDocumentUrl: "/openapi.json",
		});
		await app.init();
		return app;
	} catch (error) {
		if (app) await app.close();
		else await close?.();
		throw error;
	}
}
