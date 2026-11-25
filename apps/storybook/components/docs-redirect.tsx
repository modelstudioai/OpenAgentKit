import Link from "next/link";
import { withBasePath } from "../lib/base-path.ts";

export function DocsRedirect({ href, children }: { href: string; children: string }) {
	return (
		<main className="p-6">
			<meta httpEquiv="refresh" content={`0;url=${withBasePath(href)}`} />
			<Link href={href}>{children}</Link>
		</main>
	);
}
