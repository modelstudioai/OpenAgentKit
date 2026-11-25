import {
	AuditOutlined,
	BarChartOutlined,
	BarsOutlined,
	CodeOutlined,
	LeftOutlined,
	MenuOutlined,
	PlusOutlined,
	RightOutlined,
	SettingOutlined,
	TeamOutlined,
} from "@ant-design/icons";
import { useIsMobile } from "@openagentkit/sdk/hooks";
import { DEFAULT_BRAND_PRODUCT_NAME } from "@openagentkit/sdk/protocol";
import { Card, Drawer, Layout } from "antd";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import styles from "./console-layout.module.less";
import type { ConsoleTab } from "./console-route.ts";
import { LanguageSwitcher } from "./language-switcher.tsx";

const { Sider, Header, Content } = Layout;

/** 侧栏文案键：与 navigation 词典一一对应（文案随语言切换，结构固定）。 */
type NavigationKey =
	| "groups.assets"
	| "groups.stats"
	| "groups.system"
	| "groups.extend"
	| "items.templateCreate"
	| "items.templateList"
	| "items.usage"
	| "items.members"
	| "items.branding"
	| "items.operations"
	| "items.eval";

/** 侧栏分组：对齐百炼 Sidebar 的 sectionTitle 分组形态（智能体资产/统计/系统/拓展）。 */
const NAV_GROUPS: { title: NavigationKey; items: { id: ConsoleTab; label: NavigationKey; icon: ReactNode }[] }[] = [
	{
		title: "groups.assets",
		items: [
			{ id: "template-create", label: "items.templateCreate", icon: <PlusOutlined /> },
			{ id: "template-list", label: "items.templateList", icon: <BarsOutlined /> },
		],
	},
	{ title: "groups.stats", items: [{ id: "usage", label: "items.usage", icon: <BarChartOutlined /> }] },
	{
		title: "groups.system",
		items: [
			{ id: "members", label: "items.members", icon: <TeamOutlined /> },
			{ id: "branding", label: "items.branding", icon: <SettingOutlined /> },
			{ id: "operations", label: "items.operations", icon: <CodeOutlined /> },
		],
	},
	{ title: "groups.extend", items: [{ id: "eval", label: "items.eval", icon: <AuditOutlined /> }] },
];

const SIDEBAR_COLLAPSED_KEY = "kitConsoleSidebarCollapsed";

/**
 * 品牌区。桌面端置于通栏顶栏左段（宽度与 padding 对齐 200px 侧栏，同百炼 TopNav
 * logo 区规格），移动端置于抽屉顶部。
 */
function Brand({ desktop = false }: { desktop?: boolean }) {
	const { t } = useTranslation("navigation");
	return (
		<div className={desktop ? `${styles.brand} ${styles.brandDesktop}` : styles.brand}>
			<span aria-hidden="true" className={styles.brandMark}>
				K
			</span>
			<h1 className={`${styles.brandTitle} leading-tight`}>
				{DEFAULT_BRAND_PRODUCT_NAME}
				<br />
				{t("adminPortal")}
			</h1>
		</div>
	);
}

/** 管理端专用外壳；SessionSidebar 的新建会话与会话列表不适用于控制面导航。 */
export function ConsoleLayout({
	tab,
	onChange,
	disabled = false,
	children,
}: {
	tab: ConsoleTab;
	onChange: (tab: ConsoleTab) => void;
	disabled?: boolean;
	children: ReactNode;
}) {
	const { t } = useTranslation("navigation");
	const isMobile = useIsMobile();
	const [open, setOpen] = useState(false);
	// 侧栏折叠持久化到 localStorage（同百炼 useSidebarCollapsed 的记忆口径）。
	const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
	useEffect(() => {
		if (!isMobile) setOpen(false);
	}, [isMobile]);

	const nav = (
		<nav aria-label={t("navAria")} className={collapsed ? `${styles.menu} ${styles.menuCollapsed}` : styles.menu}>
			{NAV_GROUPS.map((group) => (
				<div key={group.title} className={styles.navGroup}>
					<div className={styles.navGroupTitle}>{t(group.title)}</div>
					<div className={styles.navGroupList}>
						{group.items.map(({ id, label, icon }) => {
							const selected = tab === id;
							return (
								<button
									key={id}
									type="button"
									className={selected ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
									disabled={disabled}
									aria-current={selected ? "page" : undefined}
									data-testid={`${id}-tab`}
									onClick={() => {
										onChange(id);
										setOpen(false);
									}}
								>
									<span aria-hidden="true" className={styles.navIcon}>
										{icon}
									</span>
									<span className={styles.navLabel}>{t(label)}</span>
								</button>
							);
						})}
					</div>
				</div>
			))}
		</nav>
	);

	const tabLabelKey = NAV_GROUPS.flatMap((group) => group.items).find(({ id }) => id === tab)?.label;
	const tabLabel = tabLabelKey ? t(tabLabelKey) : undefined;

	const toggleCollapsed = () => {
		setCollapsed((prev) => {
			localStorage.setItem(SIDEBAR_COLLAPSED_KEY, prev ? "0" : "1");
			return !prev;
		});
	};

	return (
		<Layout className={styles.shell}>
			<Header className={styles.header}>
				{isMobile ? (
					<button
						type="button"
						aria-label={t("openNavAria")}
						className={styles.menuButton}
						onClick={() => setOpen(true)}
					>
						<MenuOutlined />
					</button>
				) : null}
				<Brand desktop={!isMobile} />
				{isMobile ? <span className={styles.breadcrumbTitle}>{tabLabel}</span> : null}
				<div className="ml-auto flex items-center">
					<LanguageSwitcher />
				</div>
			</Header>
			<Layout className={styles.body}>
				{!isMobile ? (
					<div className={styles.siderWrap}>
						<Sider width={200} collapsedWidth={60} collapsed={collapsed} className={styles.sider}>
							{nav}
						</Sider>
						<span aria-hidden="true" className={styles.siderDivider} />
						<button
							type="button"
							aria-label={collapsed ? t("expandSidebar") : t("collapseSidebar")}
							aria-expanded={!collapsed}
							onClick={toggleCollapsed}
							className={styles.collapseHandle}
						>
							{collapsed ? (
								<RightOutlined className={styles.handleIcon} />
							) : (
								<LeftOutlined className={styles.handleIcon} />
							)}
						</button>
					</div>
				) : null}
				<Content className={styles.content}>
					<div className={styles.contentInner}>
						<Card variant="borderless">{children}</Card>
					</div>
				</Content>
			</Layout>
			{isMobile ? (
				<Drawer
					title={t("drawerTitle")}
					placement="left"
					width={260}
					open={open}
					onClose={() => setOpen(false)}
					styles={{ body: { padding: 0 } }}
				>
					<Brand />
					{nav}
				</Drawer>
			) : null}
		</Layout>
	);
}
