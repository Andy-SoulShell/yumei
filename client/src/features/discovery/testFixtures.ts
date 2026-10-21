/** 界面测试共用的初始 API 响应替身，不参与生产内容读取。 */
import { initialDiscovery } from "../../../../server/seeds/discovery";
import { localizeDiscovery } from "@shared/discovery";
export const discoveryFixture = localizeDiscovery(initialDiscovery(), "zh-CN");
