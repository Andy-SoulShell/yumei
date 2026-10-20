/** 分组侧边导航与手机底部导航，顶部仅承载登录和账号操作。 */
import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  Compass,
  Heart,
  ImagePlus,
  LogOut,
  Menu,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";
import { NotificationBell } from "./NotificationBell";
import { SidebarPreferences } from "./AppearanceSettings";
import { AgeGate } from "./AgeGate";
import { SignInButton } from "./SignInButton";
import { toast } from "sonner";

type NavigationLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
};

/** 全局应用框架；聊天时手机隐藏底栏，为输入框和软键盘留足空间。 */
export function AppShell({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const { user, logout, loading } = useAuth();
  const { t } = useI18n();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("yumei:sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });
  const signOut = () => {
    void logout()
      .then(() => navigate("/"))
      .catch(() => toast.error(t("auth:networkErrorPleaseTryAgain")));
  };
  const accountAvatar = user && (
    <Avatar className="account-avatar">
      {user.image && (
        <AvatarImage src={user.image} alt={user.name || user.email} />
      )}
      <AvatarFallback className="account-avatar-fallback">
        {(user.name || user.email || "Y").slice(0, 1).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
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
  const links = {
    explore: {
      href: "/explore",
      label: t("explore:navExplore"),
      icon: Compass,
      active: location === "/explore",
    },
    chats: {
      href: "/chats",
      label: t("explore:navChats"),
      icon: MessageCircle,
      active: location === "/chats" || inChat,
    },
    create: {
      href: "/setup",
      label: t("explore:navCreate"),
      icon: Plus,
      active: location.startsWith("/setup"),
    },
    generate: {
      href: "/generate",
      label: t("explore:navGenerate"),
      icon: ImagePlus,
      active: location === "/generate" || location === "/gallery",
    },
    characters: {
      href: "/characters",
      label: t("explore:navCharacters"),
      icon: Heart,
      active: location === "/characters" || location.startsWith("/memories/"),
    },
  };
  const actionLinks = [links.create, links.chats];
  const discoveryLinks = [links.explore, links.generate, links.characters];
  const navigation = (
    items: NavigationLink[],
    mobile = false,
    collapsed = sidebarCollapsed
  ) =>
    items.map(({ href, label, icon: Icon, active }) => (
      <Link
        key={href}
        href={href}
        className={`app-nav-link ${active ? "is-active" : ""} ${mobile && href === "/setup" ? "is-create" : ""}`}
        aria-current={active ? "page" : undefined}
        title={!mobile && collapsed ? label : undefined}
        onClick={() => setMobileMenuOpen(false)}
      >
        <span className="app-nav-icon">
          <Icon size={20} aria-hidden="true" />
        </span>
        <span className="app-nav-label">{label}</span>
      </Link>
    ));
  const sidebar = (collapsed: boolean) => (
    <div className="sidebar-panel">
      <nav aria-label={t("explore:mainNavigation")}>
        {[actionLinks, discoveryLinks].map(group => (
          <div
            key={group[0].href}
            className="sidebar-nav-group"
            role="group"
            aria-label={group.map(link => link.label).join(" / ")}
          >
            {navigation(group, false, collapsed)}
          </div>
        ))}
      </nav>
      <SidebarPreferences collapsed={collapsed} />
      <div className="sidebar-bottom">
        <Link
          href="/settings"
          className={`app-nav-link ${location === "/settings" ? "is-active" : ""}`}
          aria-current={location === "/settings" ? "page" : undefined}
          title={collapsed ? t("common:settings") : undefined}
          onClick={() => setMobileMenuOpen(false)}
        >
          <Settings size={20} aria-hidden="true" />
          <span className="app-nav-label">{t("common:settings")}</span>
        </Link>
        <span className="sidebar-copyright">
          © {new Date().getFullYear()} YUMEI
        </span>
      </div>
    </div>
  );
  return (
    <div
      className={`app-shell ${sidebarCollapsed ? "is-sidebar-collapsed" : ""}`}
    >
      <a className="skip-link" href="#main-content">
        {t("explore:skipToContent")}
      </a>
      <header className="app-header">
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button
              className="mobile-menu-toggle"
              variant="ghost"
              size="icon"
              aria-label={t("explore:mainNavigation")}
            >
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="mobile-sidebar"
            aria-describedby={undefined}
          >
            <SheetHeader>
              <SheetTitle>{t("explore:mainNavigation")}</SheetTitle>
            </SheetHeader>
            {sidebar(false)}
          </SheetContent>
        </Sheet>
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
        <div className="app-header-actions">
          {user ? (
            <>
              <div className="header-notifications">
                <NotificationBell />
              </div>
              <div className="mobile-account-menu">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="mobile-account-trigger"
                      aria-label={t("explore:account")}
                    >
                      {accountAvatar}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    sideOffset={8}
                    className="mobile-account-dropdown w-64 max-w-[calc(100vw-2rem)]"
                  >
                    <DropdownMenuLabel className="break-all px-3 py-2 text-sm font-medium">
                      {user.email}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="min-h-11 px-3"
                      disabled={loading}
                      onSelect={signOut}
                    >
                      <LogOut />
                      {t("auth:signOut")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div
                className="account-controls"
                role="group"
                aria-label={t("explore:account")}
              >
                {accountAvatar}
                <span className="account-email" title={user.email}>
                  {user.email}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="account-signout"
                  aria-label={t("auth:signOut")}
                  title={t("auth:signOut")}
                  disabled={loading}
                  onClick={signOut}
                >
                  <LogOut />
                </Button>
              </div>
            </>
          ) : (
            <SignInButton
              returnTo={location + window.location.search}
              disabled={loading}
            />
          )}
        </div>
      </header>
      <div className="app-workspace">
        <aside
          id="desktop-navigation"
          className="app-sidebar"
          data-state={sidebarCollapsed ? "collapsed" : "expanded"}
        >
          {sidebar(sidebarCollapsed)}
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
          {navigation(
            [
              links.explore,
              links.chats,
              links.create,
              links.generate,
              links.characters,
            ],
            true
          )}
        </nav>
      )}
      {user && <AgeGate />}
    </div>
  );
}
