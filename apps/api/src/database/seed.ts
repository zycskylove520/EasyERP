/**
 * 数据库种子。
 *
 * 设计约定：项目不预置任何业务或公司数据。品类、公司档案等一律由使用者
 * 在界面里自行填写，仓库中不留任何真实公司/联系人的默认信息，便于公开源码。
 */

/** 规格字段定义：一个字段的名称、类型、单位、是否预留（默认隐藏）。 */
export interface SpecField {
  /** 字段键，存进货品 specs JSON 的 key */
  key: string;
  /** 中文显示名 */
  label: string;
  /** 输入类型：number / text */
  type: 'number' | 'text';
  /** 单位，如 MM */
  unit?: string;
  /** 预留字段：前端默认隐藏，后续启用只改这里 */
  reserved?: boolean;
}
