import { apiErrorMessage } from "@/lib/errors";
/** 创建或编辑角色资料、预设、参考图及自定义提示词。 */

import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
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

/** 按路由进入创建或编辑模式，提交角色资料与选定或上传的参考图。 */
export default function Setup() {
  const { t } = useI18n();
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
      toast.success(t("setup:companionCreated"));
      setLocation("/");
    },
    onError: error => {
      toast.error(
        t("setup:couldNotCreateCompanion", { error: apiErrorMessage(error, t) })
      );
    },
  });

  // 亲密度经验值
  const addPoints = trpc.girlfriend.addPoints.useMutation();

  const updateGirlfriend = trpc.girlfriend.update.useMutation({
    onSuccess: () => {
      toast.success(t("setup:companionUpdated"));
      // 触发编辑资料亲密度经验值
      if (editId) {
        addPoints.mutate({ girlfriendId: editId, reason: "edit_profile" });
      }
      setLocation("/");
    },
    onError: error => {
      toast.error(
        t("setup:couldNotUpdate", { error: apiErrorMessage(error, t) })
      );
    },
  });

  const uploadAvatar = trpc.girlfriend.uploadAvatar.useMutation({
    onSuccess: data => {
      setExistingAvatarUrl(data.avatarUrl);
      setAvatarFile(null);
      setAvatarPreview(null);
      setIsUploadingAvatar(false);
      toast.success(t("setup:avatarUploaded"));
      // 触发上传头像亲密度经验值
      if (editId) {
        addPoints.mutate({ girlfriendId: editId, reason: "edit_profile" });
      }
    },
    onError: error => {
      setIsUploadingAvatar(false);
      toast.error(
        t("setup:avatarUploadFailed", { error: apiErrorMessage(error, t) })
      );
    },
  });

  const deleteGirlfriend = trpc.girlfriend.delete.useMutation({
    onSuccess: () => {
      toast.success(t("common:movedToTrashYouCanRestoreItWithin"));
      setLocation("/");
    },
    onError: error => {
      toast.error(
        t("common:couldNotDelete", { error: apiErrorMessage(error, t) })
      );
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
        toast.error(t("setup:chooseAJPGPNGGIFOrWebPImage"));
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
      toast.error(t("setup:unsupportedFormatChooseJPGPNGGIFOrWebP"));
      return;
    }

    // 大小校验
    if (file.size > MAX_AVATAR_SIZE) {
      toast.error(
        t("setup:imageIsTooLargeMBChooseAnImage", {
          size: (file.size / 1024 / 1024).toFixed(1),
        })
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
      toast.error(t("setup:fillInAllRequiredFields"));
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
        toast.error(t("setup:uploadAReferencePhoto"));
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
      className="min-h-screen bg-background app-surface p-3 sm:p-4"
      style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
    >
      <div className="max-w-2xl mx-auto py-4 sm:py-8">
        <Button
          variant="ghost"
          className="mb-4"
          onClick={() => setLocation("/")}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t("setup:back")}
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl sm:text-2xl">
              {isEditing
                ? t("setup:editCompanion")
                : t("setup:createYourCompanion")}
            </CardTitle>
            <CardDescription>
              {isEditing
                ? t("setup:editPersonalityAndInterests")
                : t("setup:chooseFrom8PresetsOrUploadAPhoto")}
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
                  <Label>{t("setup:avatar")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t("setup:uploadAnAvatarForTheHomeAndChat")}
                  </p>
                  <div className="flex items-center gap-4">
                    {/* 头像预览 */}
                    <Button
                      variant="plain"
                      size="none"
                      type="button"
                      aria-label={t("setup:upload")}
                      className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-border flex-shrink-0 cursor-pointer group"
                      onClick={() => avatarInputRef.current?.click()}
                    >
                      {displayAvatar ? (
                        <>
                          <img
                            src={displayAvatar}
                            alt={t("setup:avatar2")}
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
                            {t("setup:upload")}
                          </span>
                        </div>
                      )}
                    </Button>

                    {/* 操作按钮 */}
                    <div className="flex flex-col gap-2">
                      <Input
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
                                {t("setup:uploading")}
                              </>
                            ) : (
                              <>
                                <Upload className="w-3.5 h-3.5 mr-1" />
                                {t("setup:confirmUpload")}
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
                          {displayAvatar
                            ? t("setup:changeAvatar")
                            : t("setup:chooseImage")}
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
                          {t("setup:removeAvatar")}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 参考照片上传 */}
              <div className="space-y-2">
                <Label htmlFor="image">
                  {t("setup:referencePhoto")}
                  {!isEditing && "*"}
                </Label>
                <div className="flex flex-col items-center gap-3 sm:gap-4">
                  {displayImage ? (
                    <div className="relative w-36 h-36 sm:w-48 sm:h-48 rounded-lg overflow-hidden border-2 border-border">
                      <img
                        src={displayImage}
                        alt={t("setup:preview")}
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
                          {t("setup:change")}
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
                        {t("setup:clickToUploadAPhoto")}
                      </span>
                      <span className="text-xs text-muted-foreground mt-1">
                        {t("setup:jpgPNGGIFOrWebPUpTo10")}
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
                    {t("setup:restorePresetReference")}
                  </Button>
                )}
                {isEditing && (
                  <p className="text-xs text-muted-foreground text-center">
                    {t(
                      "setup:referencePhotosCannotBeChangedWhileEditingCreate"
                    )}
                  </p>
                )}
              </div>

              {/* 名字 */}
              <div className="space-y-2">
                <Label htmlFor="name">{t("setup:name")}</Label>
                <Input
                  id="name"
                  placeholder={t("setup:forExampleYumi")}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                />
              </div>

              {/* 性格特征 */}
              <div className="space-y-2">
                <Label htmlFor="personality">{t("setup:personality")}</Label>
                <Textarea
                  id="personality"
                  placeholder={t(
                    "setup:forExampleGentleThoughtfulAffectionateAndALittle"
                  )}
                  value={personality}
                  onChange={e => setPersonality(e.target.value)}
                  rows={4}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  {t("setup:describeThePersonalityToShapeTheCompanionS")}
                </p>
              </div>

              {/* 外貌描述 */}
              <div className="space-y-2">
                <Label htmlFor="appearance">{t("setup:appearance")}</Label>
                <Textarea
                  id="appearance"
                  placeholder={t("setup:forExampleLongFlowingHairASlimBuild")}
                  value={appearance}
                  onChange={e => setAppearance(e.target.value)}
                  rows={3}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  {t("setup:describeTheAppearanceUsedWhenGeneratingSelfies")}
                </p>
              </div>

              {/* 兴趣爱好 */}
              <div className="space-y-2">
                <Label htmlFor="interests">
                  {t("setup:interestsOptional")}
                </Label>
                <Textarea
                  id="interests"
                  placeholder={t("setup:forExampleMoviesMusicTravelAndFood")}
                  value={interests}
                  onChange={e => setInterests(e.target.value)}
                  rows={2}
                />
              </div>

              {/* 高级提示词定制 */}
              <Collapsible
                open={showCustomPrompt}
                onOpenChange={setShowCustomPrompt}
                className="border-t pt-4"
              >
                <CollapsibleTrigger asChild>
                  <Button
                    variant="plain"
                    size="none"
                    type="button"
                    className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
                  >
                    {showCustomPrompt ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                    <Brain className="w-4 h-4" />
                    {t("setup:advancedPrompt")}
                    <span className="text-xs px-1.5 py-0.5 rounded bg-muted">
                      {t("setup:optional")}
                    </span>
                  </Button>
                </CollapsibleTrigger>

                <CollapsibleContent className="mt-3 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="customPrompt">
                      {t("setup:companionSpecificPrompt")}
                    </Label>
                    <Textarea
                      id="customPrompt"
                      placeholder={t(
                        "setup:forExampleAPlayfulToneOccasionalJapaneseWords"
                      )}
                      value={customPrompt}
                      onChange={e => setCustomPrompt(e.target.value)}
                      rows={3}
                      maxLength={300}
                      className="resize-none"
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {t("setup:onlyAppliesToThisCompanionAfterTheShared")}
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {customPrompt.length}/300
                      </span>
                    </div>
                  </div>

                  {/* 提示词预览 */}
                  <Collapsible
                    open={showPromptPreview}
                    onOpenChange={setShowPromptPreview}
                    className="space-y-2"
                  >
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="plain"
                        size="none"
                        type="button"
                        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        {showPromptPreview
                          ? t("setup:hidePreview")
                          : t("setup:previewTheCombinedPrompt")}
                      </Button>
                    </CollapsibleTrigger>

                    <CollapsibleContent className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        {t("setup:previewOfThePromptSentToTheAI")}
                      </p>

                      {/* 全局提示词 */}
                      {apiConfig?.preferences?.globalPrompt ? (
                        <div className="rounded p-2 bg-blue-500/10 border border-blue-500/20">
                          <span className="text-[10px] font-semibold text-blue-500 uppercase">
                            {t("setup:sharedPrompt")}
                          </span>
                          <p className="mt-1 text-foreground/80">
                            {apiConfig.preferences?.globalPrompt}
                          </p>
                        </div>
                      ) : (
                        <div className="rounded p-2 bg-muted/50 border border-dashed">
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                            {t("setup:sharedPrompt")}
                          </span>
                          <p className="mt-1 text-muted-foreground italic">
                            {t("setup:notSetConfigureItInSettings")}
                          </p>
                        </div>
                      )}

                      {/* 个体提示词 */}
                      {customPrompt ? (
                        <div className="rounded p-2 bg-primary/10 border border-primary/20">
                          <span className="text-[10px] font-semibold text-primary uppercase">
                            {t("setup:companionPrompt")}
                          </span>
                          <p className="mt-1 text-foreground/80">
                            {customPrompt}
                          </p>
                        </div>
                      ) : (
                        <div className="rounded p-2 bg-muted/50 border border-dashed">
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                            {t("setup:companionPrompt")}
                          </span>
                          <p className="mt-1 text-muted-foreground italic">
                            {t("setup:notSet")}
                          </p>
                        </div>
                      )}

                      {/* 性格 + 外貌结构化字段 */}
                      <div className="rounded p-2 bg-purple-500/10 border border-purple-500/20">
                        <span className="text-[10px] font-semibold text-purple-500 uppercase">
                          {t("setup:characterProfile")}
                        </span>
                        <p className="mt-1 text-foreground/80">
                          {t("setup:personality2")}
                          {personality || t("setup:notProvided")}{" "}
                          {t("setup:appearance2")}
                          {appearance || t("setup:notProvided")}
                          {interests &&
                            t("setup:interests", { interests: interests })}
                        </p>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </CollapsibleContent>
              </Collapsible>

              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {isEditing ? t("common:saving") : t("setup:creating")}
                  </>
                ) : isEditing ? (
                  t("setup:saveChanges")
                ) : (
                  t("setup:createCompanion")
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
                            {t("common:deleting")}
                          </>
                        ) : (
                          <>
                            <Trash2 className="w-4 h-4 mr-2" />
                            {t("setup:deleteCompanion")}
                          </>
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {t("common:confirmDeletion")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("setup:deleteConfirm", { name })}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>
                          {t("common:cancel")}
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDelete}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {t("common:moveToTrash")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    {t("setup:restoreFromTrashWithin7DaysAfterThat")}
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
