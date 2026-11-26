import { createHmac, timingSafeEqual } from "node:crypto";
import type { Identity } from "./identity-types.ts";

function b64url(input: Buffer | string): string {
	return Buffer.from(input).toString("base64url");
}

/** HS256 JWT 校验（v1 内置实现；接企业 SSO 时替换 IdentityProvider）。 */
function identityFromClaims(payload: Record<string, unknown>): { identity: Identity; expiresAt?: string } | null {
	if (payload.exp !== undefined && (typeof payload.exp !== "number" || !Number.isFinite(payload.exp))) return null;
	if (typeof payload.exp === "number" && payload.exp * 1000 <= Date.now()) return null;
	if (typeof payload.sub !== "string" || !payload.sub || payload.sub.startsWith("member_")) return null;
	return {
		identity: {
			subjectId: payload.sub,
			...(typeof payload.name === "string" ? { displayName: payload.name } : {}),
			...(typeof payload.tier === "string" ? { tier: payload.tier } : {}),
		},
		...(typeof payload.exp === "number" ? { expiresAt: new Date(payload.exp * 1000).toISOString() } : {}),
	};
}

export function verifyJwtClaims(token: string, secret: string): { identity: Identity; expiresAt?: string } | null {
	const parts = token.split(".");
	if (parts.length !== 3) return null;
	const [headerB64, payloadB64, sigB64] = parts;
	if (!headerB64 || !payloadB64 || !sigB64) return null;
	const expected = createHmac("sha256", secret).update(`${headerB64}.${payloadB64}`).digest("base64url");
	const given = Buffer.from(sigB64, "base64url");
	const want = Buffer.from(expected, "base64url");
	if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
	try {
		const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8")) as Record<string, unknown>;
		if (header.alg !== "HS256") return null;
		const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as Record<string, unknown>;
		return identityFromClaims(payload);
	} catch {
		return null;
	}
}

export function verifyJwt(token: string, secret: string): Identity | null {
	return verifyJwtClaims(token, secret)?.identity ?? null;
}

export function signJwt(payload: Record<string, unknown>, secret: string, ttlSeconds = 3600): string {
	const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
	const body = b64url(
		JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + ttlSeconds }),
	);
	const sig = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
	return `${header}.${body}.${sig}`;
}
