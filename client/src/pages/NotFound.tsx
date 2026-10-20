/** 未匹配到应用路由时展示的回首页页面。 */

import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";

/** 展示页面不存在提示并提供返回首页操作。 */
export default function NotFound() {
  const { t } = useI18n();
  const [, setLocation] = useLocation();

  const handleGoHome = () => {
    setLocation("/");
  };

  return (
    <div className="min-h-full w-full flex items-center justify-center bg-background app-surface">
      <Card className="w-full max-w-lg mx-4 shadow-lg">
        <CardContent className="pt-8 pb-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-destructive/10 rounded-full motion-safe:animate-pulse" />
              <AlertCircle className="relative h-16 w-16 text-destructive" />
            </div>
          </div>

          <h1 className="text-4xl font-bold text-foreground mb-2">404</h1>

          <h2 className="text-xl font-semibold text-foreground mb-4">
            {t("common:pageNotFound")}
          </h2>

          <p className="text-muted-foreground mb-8 leading-relaxed">
            {t("common:sorryThePageYouAreLookingForDoesn")}
            <br />
            {t("common:itMayHaveBeenMovedOrDeleted")}
          </p>

          <div
            id="not-found-button-group"
            className="flex flex-col sm:flex-row gap-3 justify-center"
          >
            <Button
              onClick={handleGoHome}
              className="px-6 py-2.5 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg"
            >
              <Home className="w-4 h-4 mr-2" />
              {t("common:goHome")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
