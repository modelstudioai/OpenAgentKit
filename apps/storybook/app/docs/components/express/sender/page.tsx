const senderDocsPath = "/docs/components/chat/sender/";

export default function SenderDocsRedirect() {
	return (
		<main className="p-6">
			<meta httpEquiv="refresh" content={`0;url=${senderDocsPath}`} />
			<a href={senderDocsPath}>打开 Sender 输入框文档</a>
		</main>
	);
}
