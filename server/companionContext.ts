/** 从角色所属状态构建本轮聊天情绪预览。 */
import { evolveCompanionEmotion } from "../shared/companionEmotion";
import { getGirlfriendMood } from "./repositories/moods";

/** 只读已有状态，当前消息在成功结算前不写入情绪。 */
export async function getChatBehaviorContext(
  userId: string,
  girlfriendId: number,
  userMessage: string
) {
  const mood = await getGirlfriendMood(userId, girlfriendId);
  return { emotion: evolveCompanionEmotion(mood?.emotionState, userMessage) };
}
