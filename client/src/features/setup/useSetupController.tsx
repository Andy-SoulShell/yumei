import { apiErrorMessage } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import {
  getCharacterPreset,
  type CharacterPreset,
} from "@shared/characterPresets";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation, useParams, useSearch } from "wouter";

const ALLOWED_AVATAR_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

const MAX_AVATAR_SIZE = 10 * 1024 * 1024;
/** 页面查询、草稿与操作流程；展示组件只消费此状态。 */
export function useSetupController() {
  const { t } = useI18n();

  const [, setLocation] = useLocation();

  const params = useParams<{ id?: string }>();

  const editId = params.id ? parseInt(params.id) : null;

  const search = useSearch();

  const initialPreset = !editId
    ? getCharacterPreset(new URLSearchParams(search).get("preset") || "")
    : undefined;

  const [name, setName] = useState(initialPreset?.name || "");

  const [personality, setPersonality] = useState(
    initialPreset?.personality || ""
  );

  const [appearance, setAppearance] = useState(initialPreset?.appearance || "");

  const [interests, setInterests] = useState(initialPreset?.interests || "");

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
    onSuccess: () => {
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
    onSuccess: data => {
      setExistingAvatarUrl(data.avatarUrl);
      setAvatarFile(null);
      setAvatarPreview(null);
      setIsUploadingAvatar(false);
      toast.success(t("setup:avatarUploaded"));
      // 触发上传头像亲密度经验值
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
          "image/jpeg" | "image/png" | "image/gif" | "image/webp",
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

    if (!name.trim() || !personality.trim() || !appearance.trim()) {
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
      createGirlfriend.mutate({
        name: name.trim(),
        personality,
        appearance,
        interests: interests || undefined,
        customPrompt: customPrompt || undefined,
        generatePortrait: true,
      });
    }
  };

  const isEditing = !!editId;

  const isPending = createGirlfriend.isPending || updateGirlfriend.isPending;

  const displayImage =
    imagePreview ||
    existingImageUrl ||
    (presetId ? getCharacterPreset(presetId)?.imageUrl : null);

  const displayAvatar = avatarPreview || existingAvatarUrl;
  return {
    setLocation,
    t,
    isEditing,
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
    showCustomPrompt,
    setShowCustomPrompt,
    customPrompt,
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
