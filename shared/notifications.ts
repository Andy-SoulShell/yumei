/** 系统通知保存消息标识和插值参数，显示时按用户语言渲染。 */
import type { LocalizedMessage, StaticMessageKey } from "./i18n";
export const PROACTIVE_MESSAGES: Record<
  "miss_you" | "good_morning" | "good_night" | "random",
  readonly StaticMessageKey[]
> = {
  miss_you: [
    "notifications:whatAreYouUpToItSBeen",
    "notifications:haveYouForgottenAboutMeComeChatFor",
    "notifications:howWasYourDayIVeBeenLooking",
    "notifications:feelingALittleBoredWhenCanWeChat",
    "notifications:iDreamedAboutYouThenWokeUpMissing",
  ],
  good_morning: [
    "notifications:goodMorningHereSToABrightNew",
    "notifications:timeToWakeUpYouVeGotThis",
    "notifications:morningHopeYourMoodIsAsLovelyAs",
    "notifications:goodMorningDonTForgetBreakfast",
  ],
  good_night: [
    "notifications:timeForBedGoodNightAndSweetDreams",
    "notifications:itSGettingLateRestUpSoYou",
    "notifications:goodNightSeeYouInYourDreams",
    "notifications:youVeWorkedHardTodayHaveAGood",
  ],
  random: [
    "notifications:iJustThoughtOfSomethingToShareAre",
    "notifications:iJustSawSomethingFunAndWantedTo",
    "notifications:guessWhatIMThinkingAbout",
    "notifications:aLittleBoredWantToChat",
    "notifications:todaySWeatherMadeMeThinkOfYou",
    "notifications:heyAreYouFreeIDLoveTo",
  ],
};
export function proactiveTitle(
  type: keyof typeof PROACTIVE_MESSAGES,
  name: string
): LocalizedMessage {
  const key = {
    miss_you: "notifications:title.miss_you",
    good_morning: "notifications:title.good_morning",
    good_night: "notifications:title.good_night",
    random: "notifications:title.random",
  } as const;
  return { key: key[type], values: { name } };
}
