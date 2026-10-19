import { useEffect, useState } from "react";
import { getLevelInfo, getLevelGradient, type IntimacyLevel } from "../../../shared/intimacy";

interface LevelUpAnimationProps {
  show: boolean;
  newLevel: number;
  onClose: () => void;
}

export function LevelUpAnimation({ show, newLevel, onClose }: LevelUpAnimationProps) {
  const [phase, setPhase] = useState<"enter" | "show" | "exit">("enter");
  const levelInfo = getLevelInfo(newLevel);

  useEffect(() => {
    if (!show) return;

    setPhase("enter");
    const showTimer = setTimeout(() => setPhase("show"), 100);
    const exitTimer = setTimeout(() => setPhase("exit"), 3500);
    const closeTimer = setTimeout(() => onClose(), 4200);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(exitTimer);
      clearTimeout(closeTimer);
    };
  }, [show, onClose]);

  if (!show) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center pointer-events-none transition-opacity duration-500 ${
        phase === "enter" ? "opacity-0" : phase === "exit" ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

      {/* 粒子效果 */}
      <div className="absolute inset-0 overflow-hidden">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="absolute animate-bounce"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${1 + Math.random() * 2}s`,
              fontSize: `${12 + Math.random() * 20}px`,
              opacity: 0.6 + Math.random() * 0.4,
            }}
          >
            {["❤️", "💕", "✨", "💖", "🌟", "💗"][Math.floor(Math.random() * 6)]}
          </div>
        ))}
      </div>

      {/* 升级卡片 */}
      <div
        className={`relative z-10 bg-background/95 backdrop-blur-lg rounded-2xl p-8 max-w-sm mx-4 text-center shadow-2xl border transition-all duration-700 ${
          phase === "show"
            ? "scale-100 translate-y-0"
            : phase === "enter"
            ? "scale-50 translate-y-8"
            : "scale-90 translate-y-4"
        }`}
      >
        {/* 等级图标 */}
        <div className="text-6xl mb-4 animate-pulse">{levelInfo.emoji}</div>

        {/* 升级文字 */}
        <h2 className="text-2xl font-bold mb-1 bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent">
          亲密度升级！
        </h2>

        <div className={`text-3xl font-bold mb-2 ${levelInfo.color}`}>
          Lv.{levelInfo.level} {levelInfo.name}
        </div>

        <p className="text-sm text-muted-foreground mb-4">{levelInfo.description}</p>

        {/* 解锁内容 */}
        {levelInfo.unlocks.length > 0 && (
          <div className="bg-muted/50 rounded-lg p-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">🎉 解锁内容</p>
            {levelInfo.unlocks.map((unlock, i) => (
              <p key={i} className="text-sm font-medium">
                {unlock}
              </p>
            ))}
          </div>
        )}

        {/* 称呼变化提示 */}
        {levelInfo.petName !== "你" && (
          <p className="text-xs text-muted-foreground mt-3">
            她现在会叫你「{levelInfo.petName}」了 💕
          </p>
        )}
      </div>
    </div>
  );
}
