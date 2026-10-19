/** 组合全局主题、提示与路由，移动端在非首页启用边缘返回手势。 */

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch, useLocation, useSearch } from "wouter";
import type { ReactNode } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { PreferencesProvider } from "./contexts/PreferencesContext";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Setup from "./pages/Setup";
import Chat from "./pages/Chat";
import Gallery from "./pages/Gallery";
import Memories from "./pages/Memories";
import Settings from "./pages/Settings";
import { useSwipeBack } from "@/hooks/useGestures";
import { AppShell } from "./components/AppShell";
import Explore from "./pages/Explore";
import Chats from "./pages/Chats";
import Generate from "./pages/Generate";
import { useAuth } from "@/_core/hooks/useAuth";
import { loginUrl } from "@/lib/navigation";
import { Loader2 } from "lucide-react";

/** 登录状态确定后才挂载私有页面，避免游客发出受保护的查询。 */
function Authenticated({ children }: { children: ReactNode }) {
  const { loading, isAuthenticated } = useAuth();
  const [location] = useLocation();
  const search = useSearch();
  if (loading)
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  if (!isAuthenticated)
    return <Redirect to={loginUrl(location + (search ? `?${search}` : ""))} />;
  return children;
}

/** 声明页面路由，并按当前路径控制全局返回手势。 */
function Router() {
  const [location] = useLocation();
  // 在非首页启用左滑返回手势
  useSwipeBack({ enabled: location !== "/" });

  if (location === "/login") return <Login />;

  return (
    <AppShell>
      <Switch>
        <Route path="/" component={Explore} />
        <Route path="/explore" component={Explore} />
        <Route path="/characters">
          <Authenticated>
            <Home />
          </Authenticated>
        </Route>
        <Route path="/chats">
          <Authenticated>
            <Chats />
          </Authenticated>
        </Route>
        <Route path="/generate">
          <Authenticated>
            <Generate />
          </Authenticated>
        </Route>
        <Route path="/setup">
          <Authenticated>
            <Setup />
          </Authenticated>
        </Route>
        <Route path="/setup/:id">
          <Authenticated>
            <Setup />
          </Authenticated>
        </Route>
        <Route path="/chat">
          <Authenticated>
            <Chat />
          </Authenticated>
        </Route>
        <Route path="/chat/:id">
          <Authenticated>
            <Chat />
          </Authenticated>
        </Route>
        <Route path="/gallery">
          <Authenticated>
            <Gallery />
          </Authenticated>
        </Route>
        <Route path="/memories/:id">
          <Authenticated>
            <Memories />
          </Authenticated>
        </Route>
        <Route path="/settings">
          <Authenticated>
            <Settings />
          </Authenticated>
        </Route>
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

/** 应用级组件树，提供错误边界、主题、悬浮提示与消息提示容器。 */
function App() {
  return (
    <ErrorBoundary>
      <PreferencesProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </PreferencesProvider>
    </ErrorBoundary>
  );
}

export default App;
