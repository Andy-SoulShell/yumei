/** 组合全局主题、提示与路由，移动端在非首页启用边缘返回手势。 */

import { useAuth } from "@/_core/hooks/useAuth";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSwipeBack } from "@/hooks/useGestures";
import { useKeyboardViewport } from "@/hooks/useKeyboardViewport";
import { trackAppHistory } from "@/lib/app-history";
import { loginUrl } from "@/lib/navigation";
import { authModeForPath } from "@/lib/auth-navigation";
import { Loader2 } from "lucide-react";
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { Redirect, Route, Switch, useLocation, useSearch } from "wouter";
import { AppShell } from "./components/AppShell";
import ErrorBoundary from "./components/ErrorBoundary";
import { PreferencesProvider } from "./contexts/PreferencesContext";
import Landing from "./pages/Landing";

const MyCharacters = lazy(() => import("./pages/Home"));
const Explore = lazy(() => import("./pages/Explore"));
const CreateCharacter = lazy(() => import("./pages/CreateCharacter"));
const Feed = lazy(() => import("./pages/Feed"));
const Login = lazy(() => import("./pages/Login"));
const Setup = lazy(() => import("./pages/Setup"));
const Chat = lazy(() => import("./pages/Chat"));
const Gallery = lazy(() => import("./pages/Gallery"));
const Memories = lazy(() => import("./pages/Memories"));
const Settings = lazy(() => import("./pages/Settings"));
const Chats = lazy(() => import("./pages/Chats"));
const Generate = lazy(() => import("./pages/Generate"));
const Management = lazy(() => import("./pages/Management"));
const Help = lazy(() => import("./pages/Help"));
const Privacy = lazy(() => import("./pages/Privacy"));
const DataDeletion = lazy(() => import("./pages/DataDeletion"));
const NotFound = lazy(() => import("./pages/NotFound"));

function PageLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="animate-spin" />
    </div>
  );
}

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
    return (
      // 替换私有页历史，避免手机返回后再次触发同一个登录守卫。
      <Redirect
        to={loginUrl(location + (search ? `?${search}` : ""))}
        replace
      />
    );
  return children;
}

/** 声明页面路由，并按当前路径控制全局返回手势。 */
function Router() {
  const [location] = useLocation();
  // 在非首页启用左滑返回手势
  useSwipeBack({ enabled: location !== "/" });

  if (location === "/admin" || location.startsWith("/admin/"))
    return (
      <div
        data-management-scroll
        className="h-full overflow-x-hidden overflow-y-auto overscroll-y-contain scroll-pt-36"
      >
        <Suspense fallback={<PageLoading />}>
          <Management />
        </Suspense>
      </div>
    );

  if (authModeForPath(location))
    return (
      <Suspense fallback={<PageLoading />}>
        <Login />
      </Suspense>
    );

  return (
    <AppShell>
      <Suspense fallback={<PageLoading />}>
        <Switch>
          <Route path="/" component={Landing} />
          <Route path="/help" component={Help} />
          <Route path="/privacy" component={Privacy} />
          <Route path="/data-deletion" component={DataDeletion} />
          <Route path="/explore" component={Explore} />
          <Route path="/create" component={CreateCharacter} />
          <Route path="/feed" component={Feed} />
          <Route path="/characters">
            <Authenticated>
              <MyCharacters />
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
      </Suspense>
    </AppShell>
  );
}

/** 应用级组件树，提供错误边界、主题、悬浮提示与消息提示容器。 */
function App() {
  useKeyboardViewport();
  useEffect(trackAppHistory, []);
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
