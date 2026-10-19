/** 组合全局主题、提示与路由，移动端在非首页启用边缘返回手势。 */

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
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

/** 声明页面路由，并按当前路径控制全局返回手势。 */
function Router() {
  const [location] = useLocation();
  // 在非首页启用左滑返回手势
  useSwipeBack({ enabled: location !== "/" });

  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/setup" component={Setup} />
      <Route path="/setup/:id" component={Setup} />
      <Route path="/chat" component={Chat} />
      <Route path="/chat/:id" component={Chat} />
      <Route path="/gallery" component={Gallery} />
      <Route path="/memories/:id" component={Memories} />
      <Route path="/settings" component={Settings} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
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
