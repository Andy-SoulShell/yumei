import { useProductConfig } from "@/features/product/useProductConfig";
import { acceptsUpload, uploadDescription } from "@shared/operationalConfig";
import { apiErrorMessage } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import type { CharacterPreset } from "@shared/discovery";
import { useDiscovery } from "@/features/discovery/useDiscovery";
import {
  companionBehaviorSchema,
  DEFAULT_COMPANION_BEHAVIOR,
  type CompanionBehavior,
} from "@shared/companionBehavior";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation, useParams, useSearch } from "wouter";

/** 页面查询、草稿与操作流程；展示组件只消费此状态。 */
export function useSetupController() {
  const { t } = useI18n();
  const product = useProductConfig();
  const uploads = product.raw?.uploads;

  const [, setLocation] = useLocation();

  const params = useParams<{ id?: string }>();

  const editId = params.id ? Number(params.id) : null;

  const validEditId = editId !== null && Number.isInteger(editId) && editId > 0;
  const initializedEdit = useRef<number | null>(null);
  const submissionBusy = useRef(false);
  const [isReadingImage, setIsReadingImage] = useState(false);
  const search = useSearch();
  const discovery = useDiscovery();
  const characters =
    discovery.data?.characters.filter(item => item.listed) ?? [];
  const requestedPresetId = new URLSearchParams(search).get("preset") || "";
  const initializedPreset = useRef<string | null>(null);

  const initialPreset = !editId
    ? characters.find(item => item.id === requestedPresetId)
    : undefined;

  const [name, setName] = useState(initialPreset?.name || "");

  const [personality, setPersonality] = useState(
    initialPreset?.personality || ""
  );

  const [appearance, setAppearance] = useState(initialPreset?.appearance || "");

  const [interests, setInterests] = useState(initialPreset?.interests || "");

  const [behavior, setBehavior] = useState<CompanionBehavior>(() =>
    initialPreset
      ? structuredClone(initialPreset.behavior)
      : structuredClone(DEFAULT_COMPANION_BEHAVIOR)
  );
  const [behaviorError, setBehaviorError] = useState(false);

  const [imageFile, setImageFile] = useState<File | null>(null);

  const [presetId, setPresetId] = useState<string | null>(
    initialPreset?.id || null
  );

  const imageInputRef = useRef<HTMLInputElement>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);

  const [customPrompt, setCustomPrompt] = useState("");

  const [showCustomPrompt, setShowCustomPrompt] = useState(false);

  const [showPromptPreview, setShowPromptPreview] = useState(false);

  // 预设查询异步完成后仅初始化一次，后台刷新不能覆盖表单中的未保存修改。
  useEffect(() => {
    if (
      editId ||
      !requestedPresetId ||
      !initialPreset ||
      initializedPreset.current === requestedPresetId
    )
      return;
    initializedPreset.current = requestedPresetId;
    setPresetId(initialPreset.id);
    setName(initialPreset.name);
    setPersonality(initialPreset.personality);
    setAppearance(initialPreset.appearance);
    setInterests(initialPreset.interests);
    setBehavior(structuredClone(initialPreset.behavior));
  }, [editId, requestedPresetId, initialPreset]);

  // 头像相关状态
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const [existingAvatarUrl, setExistingAvatarUrl] = useState<string | null>(
    null
  );

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);

  // 获取女友列表用于编辑
  const {
    data: girlfriends,
    isLoading: editLoading,
    error: editError,
    refetch: retryEdit,
  } = trpc.girlfriend.list.useQuery(undefined, {
    enabled: validEditId,
  });

  // 获取全局提示词配置
  const { data: apiConfig } = trpc.apiConfig.get.useQuery();

  // 编辑模式：加载已有数据
  useEffect(() => {
    if (editId && girlfriends) {
      const gf = girlfriends.find(g => g.id === editId);
      if (gf && initializedEdit.current !== editId) {
        initializedEdit.current = editId;
        setName(gf.name);
        setPersonality(gf.personality);
        setAppearance(gf.appearance);
        setInterests(gf.interests || "");
        setBehavior(gf.behavior ?? structuredClone(DEFAULT_COMPANION_BEHAVIOR));
        setExistingImageUrl(gf.referenceImageUrl);
        setCustomPrompt(gf.customPrompt || "");
        setExistingAvatarUrl(gf.avatarUrl || null);
        if (gf.customPrompt) setShowCustomPrompt(true);
      }
    }
  }, [editId, girlfriends]);

  const utils = trpc.useUtils();

  const createGirlfriend = trpc.girlfriend.create.useMutation({
    onSettled: () => {
      submissionBusy.current = false;
    },
    onSuccess: async () => {
      await utils.girlfriend.invalidate();
      toast.success(t("setup:companionCreated"));
      setLocation("/characters");
    },
    onError: error => {
      toast.error(
        t("setup:couldNotCreateCompanion", { error: apiErrorMessage(error, t) })
      );
    },
  });

  // 亲密度经验值

  const updateGirlfriend = trpc.girlfriend.update.useMutation({
    onSettled: () => {
      submissionBusy.current = false;
    },
    onSuccess: async () => {
      await utils.girlfriend.invalidate();
      toast.success(t("setup:companionUpdated"));
      // 触发编辑资料亲密度经验值

      setLocation("/characters");
    },
    onError: error => {
      toast.error(
        t("setup:couldNotUpdate", { error: apiErrorMessage(error, t) })
      );
    },
  });

  const uploadAvatar = trpc.girlfriend.uploadAvatar.useMutation({
    onSuccess: async data => {
      setExistingAvatarUrl(data.avatarUrl);
      setAvatarFile(null);
      setAvatarPreview(null);
      setIsUploadingAvatar(false);
      await utils.girlfriend.invalidate();
      toast.success(t("setup:avatarUploaded"));
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
      setLocation("/characters");
    },
    onError: error => {
      toast.error(
        t("common:couldNotDelete", { error: apiErrorMessage(error, t) })
      );
    },
  });

  const removeAvatar = trpc.girlfriend.update.useMutation({
    onSuccess: async () => {
      setExistingAvatarUrl(null);
      setAvatarFile(null);
      setAvatarPreview(null);
      await utils.girlfriend.invalidate();
    },
    onError: error =>
      toast.error(
        t("setup:couldNotUpdate", { error: apiErrorMessage(error, t) })
      ),
    onSettled: () => setIsUploadingAvatar(false),
  });

  const handleDelete = () => {
    if (editId) {
      deleteGirlfriend.mutate({ id: editId });
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!uploads || !acceptsUpload(uploads.reference, file)) {
        toast.error(
          t(
            "setup:chooseAJPGPNGGIFOrWebPImage",
            uploads
              ? uploadDescription(uploads.reference)
              : { formats: "", maxMB: 0 }
          )
        );
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
    setBehavior(
      preset
        ? structuredClone(preset.behavior)
        : structuredClone(DEFAULT_COMPANION_BEHAVIOR)
    );
    setBehaviorError(false);
    setCustomPrompt("");
    setImageFile(null);
    setImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  // 头像选择处理
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || isUploadingAvatar) return;

    if (!uploads || !acceptsUpload(uploads.avatar, file)) {
      toast.error(
        t(
          "setup:chooseAJPGPNGGIFOrWebPImage",
          uploads
            ? uploadDescription(uploads.avatar)
            : { formats: "", maxMB: 0 }
        )
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
    if (!avatarFile || !editId || isUploadingAvatar) return;

    setIsUploadingAvatar(true);
    const reader = new FileReader();
    reader.onerror = () => {
      setIsUploadingAvatar(false);
      toast.error(t("setup:couldNotReadImage"));
    };
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadAvatar.mutate({
        girlfriendId: editId,
        imageBase64: base64,
        mimeType: avatarFile.type as
          "image/jpeg" | "image/png" | "image/gif" | "image/webp",
      });
    };
    reader.readAsDataURL(avatarFile);
  };

  // 移除头像（设为 null）
  const handleRemoveAvatar = () => {
    if (!editId || isUploadingAvatar) return;
    setIsUploadingAvatar(true);
    removeAvatar.mutate({ id: editId, avatarUrl: null, avatarKey: null });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (submissionBusy.current || isUploadingAvatar) return;
    const fields = { name, personality, appearance };
    const invalid = Object.entries(fields).find(([, value]) => !value.trim());
    if (invalid) {
      toast.error(t("setup:fillInAllRequiredFields"));
      document.getElementById(invalid[0])?.focus();
      return;
    }

    const parsedBehavior = companionBehaviorSchema.safeParse(behavior);
    if (!parsedBehavior.success) {
      setBehaviorError(true);
      const firstInvalidExample = behavior.examples.findIndex(
        example => !example.user.trim() || !example.assistant.trim()
      );
      document
        .getElementById(
          firstInvalidExample >= 0
            ? `behavior-example-${firstInvalidExample}-${
                behavior.examples[firstInvalidExample].user.trim()
                  ? "assistant"
                  : "user"
              }`
            : "behavior-user-nickname"
        )
        ?.focus();
      return;
    }
    setBehaviorError(false);

    if (editId) {
      submissionBusy.current = true;
      // 编辑模式
      updateGirlfriend.mutate({
        id: editId,
        name: name.trim(),
        personality: personality.trim(),
        appearance: appearance.trim(),
        interests: interests.trim(),
        customPrompt: customPrompt || null,
        behavior: parsedBehavior.data,
      });
    } else {
      // 创建模式
      if (!imageFile && !presetId) {
        toast.error(t("setup:uploadAReferencePhoto"));
        return;
      }

      if (!imageFile) {
        submissionBusy.current = true;
        createGirlfriend.mutate({
          name: name.trim(),
          personality: personality.trim(),
          appearance: appearance.trim(),
          interests: interests || undefined,
          customPrompt: customPrompt || undefined,
          presetId: presetId!,
          behavior: parsedBehavior.data,
        });
        return;
      }

      submissionBusy.current = true;
      setIsReadingImage(true);
      const reader = new FileReader();
      reader.onerror = () => {
        submissionBusy.current = false;
        setIsReadingImage(false);
        toast.error(t("setup:couldNotReadImage"));
      };
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        setIsReadingImage(false);
        createGirlfriend.mutate({
          name: name.trim(),
          personality: personality.trim(),
          appearance: appearance.trim(),
          interests: interests || undefined,
          customPrompt: customPrompt || undefined,
          presetId: presetId || undefined,
          behavior: parsedBehavior.data,
          referenceImageBase64: base64,
          referenceImageMimeType: imageFile.type as
            "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        });
      };
      reader.readAsDataURL(imageFile);
    }
  };

  const isEditing = params.id !== undefined;
  const editNotFound =
    isEditing &&
    (!validEditId ||
      (!editLoading &&
        !editError &&
        girlfriends &&
        !girlfriends.some(g => g.id === editId)));

  const isPending =
    createGirlfriend.isPending || updateGirlfriend.isPending || isReadingImage;

  const displayImage =
    imagePreview ||
    existingImageUrl ||
    (presetId ? characters.find(item => item.id === presetId)?.imageUrl : null);

  const displayAvatar = avatarPreview || existingAvatarUrl;
  return {
    uploads,
    characters,
    presetLoading: !isEditing && discovery.isLoading,
    presetError: !isEditing ? discovery.error : null,
    retryPresets: discovery.refetch,
    presetNotFound:
      !isEditing && !!requestedPresetId && !!discovery.data && !initialPreset,
    setLocation,
    t,
    isEditing,
    editLoading,
    editError,
    editNotFound,
    retryEdit,
    handleSubmit,
    presetId,
    handleSelectPreset,
    avatarInputRef,
    displayAvatar,
    handleAvatarChange,
    avatarFile,
    handleUploadAvatar,
    isUploadingAvatar,
    setAvatarFile,
    setAvatarPreview,
    existingAvatarUrl,
    handleRemoveAvatar,
    displayImage,
    imageInputRef,
    handleImageChange,
    imageFile,
    setImageFile,
    setImagePreview,
    name,
    setName,
    personality,
    setPersonality,
    appearance,
    setAppearance,
    interests,
    setInterests,
    behavior,
    setBehavior,
    behaviorError,
    showCustomPrompt,
    setShowCustomPrompt,
    customPrompt,
    previewMemoryEnabled:
      girlfriends?.find(g => g.id === editId)?.memoryEnabled ?? true,
    previewCharacter: {
      name,
      personality,
      appearance,
      interests,
      customPrompt,
      behavior,
      intimacyPoints:
        girlfriends?.find(g => g.id === editId)?.intimacyPoints ?? 0,
    },
    setCustomPrompt,
    showPromptPreview,
    setShowPromptPreview,
    apiConfig,
    isPending,
    deleteGirlfriend,
    handleDelete,
  };
}
export type SetupController = ReturnType<typeof useSetupController>;
