import type { Directive } from 'vue';

/**
 * 数字输入过滤指令：只保留数字、一个小数点，可选负号（v-numeric="{ allowNegative: true }"）。
 * 输入时即时剔除字母/特殊符号/多余小数点，保证输入框里永远是合法数字文本。
 * 过滤后派发 input 事件以同步 v-model；值未变化时不派发，避免递归。
 */
interface NumericOptions {
  /** 是否允许负号（默认 false；库存调整等场景设为 true） */
  allowNegative?: boolean;
}

function sanitize(raw: string, allowNegative: boolean): string {
  // 保留数字、点、负号
  let s = raw.replace(/[^\d.-]/g, '');
  // 负号只允许开头一个
  const hasNeg = s.indexOf('-') >= 0;
  s = s.replace(/-/g, '');
  // 只保留第一个小数点
  const firstDot = s.indexOf('.');
  if (firstDot >= 0) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '');
  }
  if (hasNeg && allowNegative && s !== '' && s !== '.') s = '-' + s;
  return s;
}

export const numeric: Directive<HTMLInputElement, NumericOptions | undefined> = {
  mounted(el, binding) {
    const handler = () => {
      // 只对 type=number 的输入框生效（文本类规格字段不受影响）
      if (el.type !== 'number') return;
      const allowNeg = binding.value?.allowNegative === true;
      const next = sanitize(el.value, allowNeg);
      if (next !== el.value) {
        el.value = next;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };
    el.addEventListener('input', handler);
    (el as HTMLInputElement & { __numericHandler?: () => void }).__numericHandler = handler;
  },
  unmounted(el) {
    const h = (el as HTMLInputElement & { __numericHandler?: () => void }).__numericHandler;
    if (h) el.removeEventListener('input', h);
  },
};

/** 数值校验结果：合法返回 null，否则返回错误文案。 */
export function checkNumeric(
  value: unknown,
  label: string,
  opts: { required?: boolean; min?: number; allowNegative?: boolean } = {},
): string | null {
  if (value === '' || value === null || value === undefined) {
    return opts.required ? `${label}不能为空` : null;
  }
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return `${label}必须是数字`;
  if (!opts.allowNegative && n < 0) return `${label}不能为负数`;
  if (opts.min !== undefined && n < opts.min) return `${label}不能小于 ${opts.min}`;
  return null;
}

/** 必填文本校验。 */
export function checkRequired(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return `${label}不能为空`;
  if (typeof value === 'string' && value.trim() === '') return `${label}不能为空`;
  return null;
}

/** 取第一条错误（过滤 null）。 */
export function firstError(...results: Array<string | null>): string | null {
  return results.find((r) => r !== null) ?? null;
}
