import { createMemberAuthController, type MemberAuthController, type MemberAuthOptions } from "@openagentkit/sdk/auth";
import { useMemberAuth } from "@openagentkit/sdk/auth/hooks";
import { KitProvider } from "@openagentkit/sdk/providers/kit/react";
import type { FormEvent, ReactNode } from "react";

// 公开配置解析出最终 API URL 后调用一次。宿主存储按带路径前缀的完整 URL 隔离，
// 只保存会话令牌及有效期。
export function createLogin(options: MemberAuthOptions) {
	return createMemberAuthController(options);
}

export function MemberRoot({ controller, children }: { controller: MemberAuthController; children: ReactNode }) {
	const auth = useMemberAuth(controller);
	if (auth.status === "checking") return <p>正在恢复登录…</p>;
	if (auth.status === "error") {
		return (
			<section>
				<p role="alert">{auth.error}</p>
				<button type="button" onClick={() => void auth.retry()}>
					重试
				</button>
			</section>
		);
	}
	if (!auth.client) {
		const submit = async (event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			const form = event.currentTarget;
			const data = new FormData(form);
			try {
				await auth.login({
					username: String(data.get("username") ?? ""),
					password: String(data.get("password") ?? ""),
				});
			} catch {
				// 控制器在快照中提供可安全展示的错误。
			} finally {
				const password = form.elements.namedItem("password");
				if (password instanceof HTMLInputElement) password.value = "";
			}
		};
		return (
			<form onSubmit={submit}>
				<label>
					用户名 <input name="username" autoComplete="username" required disabled={auth.pending} />
				</label>
				<label>
					密码{" "}
					<input name="password" type="password" autoComplete="current-password" required disabled={auth.pending} />
				</label>
				{auth.error && <p role="alert">{auth.error}</p>}
				<button type="submit" disabled={auth.pending}>
					登录
				</button>
			</form>
		);
	}
	return (
		<KitProvider key={auth.generation} client={auth.client}>
			<header>
				{auth.member?.display_name}
				{auth.member && (
					<button type="button" onClick={() => void auth.logout()}>
						退出登录
					</button>
				)}
			</header>
			{children}
		</KitProvider>
	);
}
