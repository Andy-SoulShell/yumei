import { normalizeLocale } from "@shared/locales";
/** 捕获子组件渲染异常并展示刷新入口，不处理事件或异步请求错误。 */

import { Button } from "@/components/ui/button";
import { translate } from "@/lib/i18n";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";

/** 错误边界包裹的 React 子节点。 */
interface Props {
  children: ReactNode;
}

/** 是否进入错误界面以及最后捕获的渲染错误。 */
interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * 将子树渲染异常转换为错误界面。
 *
 * @remarks 当前界面会展示异常堆栈，公开部署前应评估其暴露范围。
 */
class ErrorBoundary extends Component<Props, State> {
  /** 初始化尚未发生渲染错误的边界状态。 */
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  /** 将捕获的渲染错误保存到边界状态。 */
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  /** 正常时展示子节点，异常时展示错误堆栈和页面刷新入口。 */
  render() {
    const t = (text: import("@shared/i18n").StaticMessageKey) =>
      translate(text, normalizeLocale(document.documentElement.lang));
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl mb-4">
              {t("common:anUnexpectedErrorOccurred")}
            </h2>

            <div className="p-4 w-full rounded bg-muted overflow-auto mb-6">
              <pre className="text-sm text-muted-foreground whitespace-break-spaces">
                {this.state.error?.stack}
              </pre>
            </div>

            <Button
              type="button"
              onClick={() => window.location.reload()}
              className="gap-2"
            >
              <RotateCcw size={16} />
              {t("common:reloadPage")}
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
