import { z } from "zod";

export const OidcSubjectSchema = z.string().regex(/^[!-~]{1,255}$/, "请输入 Keycloak 用户的 subject");
export const MemberOidcBindingInputSchema = z.object({ sub: OidcSubjectSchema });
export const MemberOidcBindingSchema = MemberOidcBindingInputSchema.extend({
	issuer: z.url(),
	member_id: z.string(),
	bound_at: z.string(),
});
export const MemberOidcBindingResponseSchema = z.object({ data: MemberOidcBindingSchema.nullable() });
export type MemberOidcBinding = z.infer<typeof MemberOidcBindingSchema>;
