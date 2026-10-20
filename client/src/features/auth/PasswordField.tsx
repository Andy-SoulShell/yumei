/** 带可访问标签、自动填充和显示切换的密码输入框。 */
import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@shared/auth";

/** 密码保持原值，切换可见性不改变输入内容。 */
export function PasswordField({
  label,
  name,
  value,
  onChange,
  disabled,
  autoComplete = "new-password",
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoComplete?: "current-password" | "new-password";
}) {
  const id = useId();
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          value={value}
          onChange={event => onChange(event.target.value)}
          disabled={disabled}
          required
          autoComplete={autoComplete}
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={PASSWORD_MAX_LENGTH}
          className="h-11 pr-12"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0 top-0 h-11 w-11"
          aria-label={t(visible ? "auth:hidePassword" : "auth:showPassword")}
          aria-pressed={visible}
          onClick={() => setVisible(value => !value)}
          disabled={disabled}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </Button>
      </div>
    </div>
  );
}
