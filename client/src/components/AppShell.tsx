/** PC 侧边导航与手机底部导航，共享账号、语言和主题入口。 */
import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowRight,
  Compass,
  Heart,
  ImagePlus,
  LogOut,
  MessageCircle,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Sparkles,
  Sun,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/lib/i18n";
import { loginUrl } from "@/lib/navigation";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { NotificationBell } from "./NotificationBell";
import { LanguagePicker } from "./AppearanceSettings";
import { AgeGate } from "./AgeGate";
import { toast } from "sonner";

/** 全局应用框架；聊天时手机隐藏底栏，为输入框和软键盘留足空间。 */
export function AppShell({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const { user, logout, loading } = useAuth();
  const { t } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("yumei:sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });
  const toggleSidebar = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    try {
      localStorage.setItem("yumei:sidebar-collapsed", String(next));
    } catch {
      /* 浏览器禁用存储时，本次会话仍可手动折叠。 */
    }
  };
  const inChat = /^\/chat(?:\/|$)/.test(location);
  const links = [
    {
      href: "/",
      label: t("explore:navExplore"),
      icon: Compass,
      active: location === "/" || location === "/explore",
    },
    {
      href: "/chats",
      label: t("explore:navChats"),
      icon: MessageCircle,
      active: location === "/chats" || inChat,
    },
    {
      href: "/setup",
      label: t("explore:navCreate"),
      icon: Plus,
      active: location.startsWith("/setup"),
    },
    {
      href: "/generate",
      label: t("explore:navGenerate"),
      icon: ImagePlus,
      active: location === "/generate" || location === "/gallery",
    },
    {
      href: "/characters",
      label: t("explore:navCharacters"),
      icon: Heart,
      active: location === "/characters" || location.startsWith("/memories/"),
    },
  ];
  const navigation = (mobile = false) =>
    links.map(({ href, label, icon: Icon, active }) => (
      <Link
        key={href}
        href={href}
        className={`app-nav-link ${active ? "is-active" : ""} ${mobile && href === "/setup" ? "is-create" : ""}`}
        aria-current={active ? "page" : undefined}
        title={!mobile && sidebarCollapsed ? label : undefined}
      >
        <span className="app-nav-icon">
          <Icon size={20} aria-hidden="true" />
        </span>
        <span className="app-nav-label">{label}</span>
      </Link>
    ));
  return (
    <div
      className={`app-shell ${sidebarCollapsed ? "is-sidebar-collapsed" : ""}`}
    >
      <a className="skip-link" href="#main-content">
        {t("explore:skipToContent")}
      </a>
      <header className="app-header">
        <Link href="/" className="app-brand" aria-label="YUMEI">
          <span className="brand-mark">
            <Sparkles size={20} />
          </span>
          YUMEI<span className="brand-period">.</span>
        </Link>
        <Button
          className="sidebar-toggle"
          variant="ghost"
          size="icon"
          aria-label={t(
            sidebarCollapsed
              ? "explore:expandSidebar"
              : "explore:collapseSidebar"
          )}
          aria-expanded={!sidebarCollapsed}
          aria-controls="desktop-navigation"
          onClick={toggleSidebar}
        >
          {sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
        <span className="app-header-caption">{t("explore:brandCaption")}</span>
        <div className="app-header-actions">
          <div className="header-language">
            <LanguagePicker />
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("common:toggleDisplayMode")}
            onClick={toggleTheme}
          >
            {theme === "dark" ? <Sun /> : <Moon />}
          </Button>
          {user && <NotificationBell />}
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="account-trigger"
                  aria-label={t("explore:account")}
                >
                  <span className="account-avatar">
                    {(user.name || user.email || "Y").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="account-name">
                    {user.name || user.email}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="truncate px-2 py-2 text-xs text-muted-foreground">
                  {user.email}
                </div>
                <DropdownMenuItem onSelect={() => navigate("/settings")}>
                  <Settings />
                  {t("common:settings")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate("/characters")}>
                  <Heart />
                  {t("explore:navCharacters")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    void logout()
                      .then(() => navigate("/"))
                      .catch(() =>
                        toast.error(t("auth:networkErrorPleaseTryAgain"))
                      );
                  }}
                >
                  <LogOut />
                  {t("auth:signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild className="header-signin" disabled={loading}>
              <Link href={loginUrl(location + window.location.search)}>
                {t("explore:signIn")}
                <ArrowRight />
              </Link>
            </Button>
          )}
        </div>
      </header>
      <div className="app-workspace">
        <aside
          id="desktop-navigation"
          className="app-sidebar"
          data-state={sidebarCollapsed ? "collapsed" : "expanded"}
        >
          <div className="sidebar-panel">
            <p className="sidebar-label">{t("explore:yourWorld")}</p>
            <nav aria-label={t("explore:mainNavigation")}>{navigation()}</nav>
            <div className="sidebar-bottom">
              <div className="sidebar-note">
                <Sparkles size={18} />
                <p>{t("explore:sidebarNote")}</p>
                <Link href="/setup">
                  {t("explore:heroSecondary")}
                  <ArrowRight size={14} />
                </Link>
              </div>
              <Link
                href="/settings"
                className={`app-nav-link ${location === "/settings" ? "is-active" : ""}`}
                aria-current={location === "/settings" ? "page" : undefined}
                title={sidebarCollapsed ? t("common:settings") : undefined}
              >
                <Settings size={20} />
                <span className="app-nav-label">{t("common:settings")}</span>
              </Link>
              <p className="sidebar-disclosure">{t("explore:disclosure")}</p>
              <span className="sidebar-copyright">
                © {new Date().getFullYear()} YUMEI
              </span>
            </div>
          </div>
        </aside>
        <main
          id="main-content"
          tabIndex={-1}
          className={`app-main ${inChat ? "app-main-chat" : ""}`}
          key={location}
        >
          {children}
        </main>
      </div>
      {!inChat && (
        <nav
          className="app-bottom-nav"
          aria-label={t("explore:mainNavigation")}
        >
          {navigation(true)}
        </nav>
      )}
      {user && <AgeGate />}
    </div>
  );
}
