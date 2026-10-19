import type en from "./en";

/** 每个已发布的语言包都必须覆盖基准包的文案标识。 */
export type MessageCatalog = {
  [Namespace in keyof typeof en]: {
    [Key in keyof (typeof en)[Namespace]]: string;
  };
};
