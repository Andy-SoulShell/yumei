import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  Loader2,
  Upload,
  ArrowLeft,
  Trash2,
  ChevronDown,
  ChevronUp,
  Eye,
  Brain,
  Camera,
  X,
} from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { CharacterPresetPicker } from "@/components/CharacterPresetPicker";
import {
  getCharacterPreset,
  type CharacterPreset,
} from "@shared/characterPresets";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const ALLOWED_AVATAR_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];
const MAX_AVATAR_SIZE = 10 * 1024 * 1024; // 10MB

export default function Setup() {
  const [, setLocation] = useLocation();
  const params = useParams<{ id?: string }>();
  const editId = params.id ? parseInt(params.id) : null;

  const [name, setName] = useState("");
  const [personality, setPersonality] = useState("");
  const [appearance, setAppearance] = useState("");
  const [interests, setInterests] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [presetId, setPresetId] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);
  const [showPromptPreview, setShowPromptPreview] = useState(false);

  // 头像相关状态
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [existingAvatarUrl, setExistingAvatarUrl] = useState<string | null>(
    null
  );
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // 获取女友列表用于编辑
  const { data: girlfriends } = trpc.girlfriend.list.useQuery(undefined, {
    enabled: !!editId,
  });

  // 获取全局提示词配置
  const { data: apiConfig } = trpc.apiConfig.get.useQuery();

  // 编辑模式：加载已有数据
  useEffect(() => {
    if (editId && girlfriends) {
      const gf = girlfriends.find(g => g.id === editId);
      if (gf) {
        setName(gf.name);
        setPersonality(gf.personality);
        setAppearance(gf.appearance);
        setInterests(gf.interests || "");
        setExistingImageUrl(gf.referenceImageUrl);
        setCustomPrompt(gf.customPrompt || "");
        setExistingAvatarUrl(gf.avatarUrl || null);
        if (gf.customPrompt) setShowCustomPrompt(true);
      }
    }
  }, [editId, girlfriends]);

  const utils = trpc.useUtils();
  const createGirlfriend = trpc.girlfriend.create.useMutation({
    onSuccess: async () => {
      await utils.girlfriend.invalidate();
      toast.success("女友配置创建成功！");
      setLocation("/");
    },
    onError: error => {
      toast.error(`创建失败：${error.message}`);
    },
  });

  // 亲密度经验值
  const addPoints = trpc.girlfriend.addPoints.useMutation();

  const updateGirlfriend = trpc.girlfriend.update.useMutation({
    onSuccess: () => {
      toast.success("女友配置更新成功！");
      // 触发编辑资料亲密度经验值
      if (editId) {
        addPoints.mutate({ girlfriendId: editId, reason: "edit_profile" });
      }
      setLocation("/");
    },
    onError: error => {
      toast.error(`更新失败：${error.message}`);
    },
  });

  const uploadAvatar = trpc.girlfriend.uploadAvatar.useMutation({
    onSuccess: data => {
      setExistingAvatarUrl(data.avatarUrl);
      setAvatarFile(null);
      setAvatarPreview(null);
      setIsUploadingAvatar(false);
      toast.success("头像上传成功！");
      // 触发上传头像亲密度经验值
      if (editId) {
        addPoints.mutate({ girlfriendId: editId, reason: "edit_profile" });
      }
    },
    onError: error => {
      setIsUploadingAvatar(false);
      toast.error(`头像上传失败：${error.message}`);
    },
  });

  const deleteGirlfriend = trpc.girlfriend.delete.useMutation({
    onSuccess: () => {
      toast.success("已移入回收站，7天内可恢复");
      setLocation("/");
    },
    onError: error => {
      toast.error(`删除失败：${error.message}`);
    },
  });

  const handleDelete = () => {
    if (editId) {
      deleteGirlfriend.mutate({ id: editId });
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (
        !ALLOWED_AVATAR_TYPES.includes(file.type) ||
        file.size > MAX_AVATAR_SIZE
      ) {
        toast.error("请选择 10MB 以内的 JPG、PNG、GIF 或 WebP 图片");
        e.target.value = "";
        return;
      }
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSelectPreset = (preset: CharacterPreset | null) => {
    setPresetId(preset?.id || null);
    setName(preset?.name || "");
    setPersonality(preset?.personality || "");
    setAppearance(preset?.appearance || "");
    setInterests(preset?.interests || "");
    setCustomPrompt("");
    setImageFile(null);
    setImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  // 头像选择处理
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 格式校验
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      toast.error("不支持的图片格式，请选择 JPG、PNG、GIF 或 WebP 格式");
      return;
    }

    // 大小校验
    if (file.size > MAX_AVATAR_SIZE) {
      toast.error(
        `图片文件过大（${(file.size / 1024 / 1024).toFixed(1)}MB），请选择 10MB 以内的图片`
      );
      return;
    }

    setAvatarFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // 上传头像
  const handleUploadAvatar = () => {
    if (!avatarFile || !editId) return;

    setIsUploadingAvatar(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadAvatar.mutate({
        girlfriendId: editId,
        imageBase64: base64,
        mimeType: avatarFile.type as
          | "image/jpeg"
          | "image/png"
          | "image/gif"
          | "image/webp",
      });
    };
    reader.readAsDataURL(avatarFile);
  };

  // 移除头像（设为 null）
  const handleRemoveAvatar = () => {
    if (editId) {
      updateGirlfriend.mutate({
        id: editId,
        avatarUrl: null,
        avatarKey: null,
      });
      setExistingAvatarUrl(null);
      setAvatarFile(null);
      setAvatarPreview(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !personality || !appearance) {
      toast.error("请填写所有必填项");
      return;
    }

    if (editId) {
      // 编辑模式
      updateGirlfriend.mutate({
        id: editId,
        name,
        personality,
        appearance,
        interests: interests || undefined,
        customPrompt: customPrompt || null,
      });
    } else {
      // 创建模式
      if (!imageFile && !presetId) {
        toast.error("请上传参考照片");
        return;
      }

      if (!imageFile) {
        createGirlfriend.mutate({
          name,
          personality,
          appearance,
          interests: interests || undefined,
          customPrompt: customPrompt || undefined,
          presetId: presetId!,
        });
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(",")[1];
        createGirlfriend.mutate({
          name,
          personality,
          appearance,
          interests: interests || undefined,
          customPrompt: customPrompt || undefined,
          referenceImageBase64: base64,
          referenceImageMimeType: imageFile.type as
            | "image/jpeg"
            | "image/png"
            | "image/gif"
            | "image/webp",
        });
      };
      reader.readAsDataURL(imageFile);
    }
  };

  const isEditing = !!editId;
  const isPending = createGirlfriend.isPending || updateGirlfriend.isPending;
  const displayImage =
    imagePreview ||
    existingImageUrl ||
    (presetId ? getCharacterPreset(presetId)?.imageUrl : null);
  const displayAvatar = avatarPreview || existingAvatarUrl;

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50 dark:from-[oklch(0.16_0.02_330)] dark:via-[oklch(0.14_0.015_320)] dark:to-[oklch(0.16_0.02_300)] p-3 sm:p-4"
      style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
    >
      <div className="max-w-2xl mx-auto py-4 sm:py-8">
        <Button
          variant="ghost"
          className="mb-4"
          onClick={() => setLocation("/")}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          返回
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl sm:text-2xl">
              {isEditing ? "编辑女友配置" : "创建你的专属女友"}
            </CardTitle>
            <CardDescription>
              {isEditing
                ? "修改性格特征和兴趣爱好"
                : "从 8 位预设角色中选择，或上传照片创建自己的角色"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {!isEditing && (
                <CharacterPresetPicker
                  selectedId={presetId}
                  onSelect={handleSelectPreset}
                />
              )}
              {/* 头像上传区域 - 编辑模式显示 */}
              {isEditing && (
                <div className="space-y-2">
                  <Label>头像照片</Label>
                  <p className="text-xs text-muted-foreground">
                    上传一张头像照片，将在首页卡片和聊天页展示（支持
                    JPG/PNG/GIF/WebP，最大 10MB）
                  </p>
                  <div className="flex items-center gap-4">
                    {/* 头像预览 */}
                    <div
                      className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-border flex-shrink-0 cursor-pointer group"
                      onClick={() => avatarInputRef.current?.click()}
                    >
                      {displayAvatar ? (
                        <>
                          <img
                            src={displayAvatar}
                            alt="Avatar"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Camera className="w-5 h-5 text-white" />
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full bg-muted flex flex-col items-center justify-center gap-0.5">
                          <Camera className="w-5 h-5 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">
                            上传
                          </span>
                        </div>
                      )}
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex flex-col gap-2">
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        className="hidden"
                        onChange={handleAvatarChange}
                      />
                      {avatarFile ? (
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleUploadAvatar}
                            disabled={isUploadingAvatar}
                          >
                            {isUploadingAvatar ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                                上传中...
                              </>
                            ) : (
                              <>
                                <Upload className="w-3.5 h-3.5 mr-1" />
                                确认上传
                              </>
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setAvatarFile(null);
                              setAvatarPreview(null);
                            }}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => avatarInputRef.current?.click()}
                        >
                          <Camera className="w-3.5 h-3.5 mr-1" />
                          {displayAvatar ? "更换头像" : "选择图片"}
                        </Button>
                      )}
                      {existingAvatarUrl && !avatarFile && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive text-xs"
                          onClick={handleRemoveAvatar}
                        >
                          <X className="w-3 h-3 mr-1" />
                          移除头像
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 参考照片上传 */}
              <div className="space-y-2">
                <Label htmlFor="image">参考照片 {!isEditing && "*"}</Label>
                <div className="flex flex-col items-center gap-3 sm:gap-4">
                  {displayImage ? (
                    <div className="relative w-36 h-36 sm:w-48 sm:h-48 rounded-lg overflow-hidden border-2 border-border">
                      <img
                        src={displayImage}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                      {!isEditing && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="absolute bottom-2 right-2"
                          onClick={() => {
                            imageInputRef.current?.click();
                          }}
                        >
                          更换
                        </Button>
                      )}
                    </div>
                  ) : (
                    <label
                      htmlFor="image"
                      className="w-48 h-48 flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary transition-colors"
                    >
                      <Upload className="w-12 h-12 text-muted-foreground mb-2" />
                      <span className="text-sm text-muted-foreground">
                        点击上传照片
                      </span>
                      <span className="text-xs text-muted-foreground mt-1">
                        支持 JPG、PNG、GIF、WebP，最大 10MB
                      </span>
                    </label>
                  )}
                  {!isEditing && (
                    <Input
                      id="image"
                      ref={imageInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      className="hidden"
                      onChange={handleImageChange}
                    />
                  )}
                </div>
                {!isEditing && imageFile && presetId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setImageFile(null);
                      setImagePreview(null);
                      if (imageInputRef.current)
                        imageInputRef.current.value = "";
                    }}
                  >
                    恢复预设参考图
                  </Button>
                )}
                {isEditing && (
                  <p className="text-xs text-muted-foreground text-center">
                    编辑模式下暂不支持更换参考照片，如需更换请创建新女友
                  </p>
                )}
              </div>

              {/* 名字 */}
              <div className="space-y-2">
                <Label htmlFor="name">名字 *</Label>
                <Input
                  id="name"
                  placeholder="例如：小雨"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                />
              </div>

              {/* 性格特征 */}
              <div className="space-y-2">
                <Label htmlFor="personality">性格特征 *</Label>
                <Textarea
                  id="personality"
                  placeholder="例如：温柔体贴，善解人意，喜欢撒娇，偶尔会有点小任性..."
                  value={personality}
                  onChange={e => setPersonality(e.target.value)}
                  rows={4}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  详细描述性格特征，这将影响 AI 的对话风格
                </p>
              </div>

              {/* 外貌描述 */}
              <div className="space-y-2">
                <Label htmlFor="appearance">外貌描述 *</Label>
                <Textarea
                  id="appearance"
                  placeholder="例如：长发飘逸，皮肤白皙，身材苗条，喜欢穿裙子..."
                  value={appearance}
                  onChange={e => setAppearance(e.target.value)}
                  rows={3}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  描述外貌特征，用于生成自拍照片
                </p>
              </div>

              {/* 兴趣爱好 */}
              <div className="space-y-2">
                <Label htmlFor="interests">兴趣爱好（可选）</Label>
                <Textarea
                  id="interests"
                  placeholder="例如：喜欢看电影、听音乐、旅行、美食..."
                  value={interests}
                  onChange={e => setInterests(e.target.value)}
                  rows={2}
                />
              </div>

              {/* 高级提示词定制 */}
              <div className="border-t pt-4">
                <button
                  type="button"
                  onClick={() => setShowCustomPrompt(!showCustomPrompt)}
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
                >
                  {showCustomPrompt ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                  <Brain className="w-4 h-4" />
                  高级提示词定制
                  <span className="text-xs px-1.5 py-0.5 rounded bg-muted">
                    可选
                  </span>
                </button>

                {showCustomPrompt && (
                  <div className="mt-3 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="customPrompt">专属提示词</Label>
                      <Textarea
                        id="customPrompt"
                        placeholder="例如：说话带点傲娇，偶尔用日语词汇，喜欢用哼开头..."
                        value={customPrompt}
                        onChange={e => setCustomPrompt(e.target.value)}
                        rows={3}
                        maxLength={300}
                        className="resize-none"
                      />
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                          仅对这个女友生效，会追加到全局提示词之后
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {customPrompt.length}/300
                        </span>
                      </div>
                    </div>

                    {/* 提示词预览 */}
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => setShowPromptPreview(!showPromptPreview)}
                        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        {showPromptPreview
                          ? "收起预览"
                          : "查看最终生效的提示词"}
                      </button>

                      {showPromptPreview && (
                        <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
                          <p className="text-xs font-medium text-muted-foreground mb-2">
                            最终发送给 AI 的提示词预览：
                          </p>

                          {/* 全局提示词 */}
                          {apiConfig?.preferences?.globalPrompt ? (
                            <div className="rounded p-2 bg-blue-500/10 border border-blue-500/20">
                              <span className="text-[10px] font-semibold text-blue-500 uppercase">
                                全局提示词
                              </span>
                              <p className="mt-1 text-foreground/80">
                                {apiConfig.preferences?.globalPrompt}
                              </p>
                            </div>
                          ) : (
                            <div className="rounded p-2 bg-muted/50 border border-dashed">
                              <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                                全局提示词
                              </span>
                              <p className="mt-1 text-muted-foreground italic">
                                未设置，可在设置页配置
                              </p>
                            </div>
                          )}

                          {/* 个体提示词 */}
                          {customPrompt ? (
                            <div className="rounded p-2 bg-pink-500/10 border border-pink-500/20">
                              <span className="text-[10px] font-semibold text-pink-500 uppercase">
                                个体提示词
                              </span>
                              <p className="mt-1 text-foreground/80">
                                {customPrompt}
                              </p>
                            </div>
                          ) : (
                            <div className="rounded p-2 bg-muted/50 border border-dashed">
                              <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                                个体提示词
                              </span>
                              <p className="mt-1 text-muted-foreground italic">
                                未设置
                              </p>
                            </div>
                          )}

                          {/* 性格 + 外貌结构化字段 */}
                          <div className="rounded p-2 bg-purple-500/10 border border-purple-500/20">
                            <span className="text-[10px] font-semibold text-purple-500 uppercase">
                              角色设定
                            </span>
                            <p className="mt-1 text-foreground/80">
                              性格：{personality || "未填写"} | 外貌：
                              {appearance || "未填写"}
                              {interests && ` | 兴趣：${interests}`}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {isEditing ? "保存中..." : "创建中..."}
                  </>
                ) : isEditing ? (
                  "保存修改"
                ) : (
                  "创建女友"
                )}
              </Button>

              {/* 删除按钮 - 仅编辑模式显示 */}
              {isEditing && (
                <div className="pt-4 border-t">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="destructive"
                        className="w-full"
                        disabled={deleteGirlfriend.isPending}
                      >
                        {deleteGirlfriend.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            删除中...
                          </>
                        ) : (
                          <>
                            <Trash2 className="w-4 h-4 mr-2" />
                            删除女友
                          </>
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>确认删除</AlertDialogTitle>
                        <AlertDialogDescription>
                          确定要删除 <strong>{name}</strong>{" "}
                          吗？她将被移入回收站，7 天内可以在首页回收站中恢复。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDelete}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          移入回收站
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    删除后可在首页回收站中恢复，7 天后自动永久删除
                  </p>
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
