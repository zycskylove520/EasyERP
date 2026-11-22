/**
 * 人民币金额转中文大写。
 * 支持到「分」，整数部分到「兆」，超过则退化为普通数字拼接。
 * 例：950 → 玖佰伍拾元整；17010.05 → 壹万柒仟零壹拾元零伍分。
 */
const DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
const INT_UNITS = ['', '拾', '佰', '仟'];
const SECTION_UNITS = ['', '万', '亿', '兆'];

/** 把 0~9999 的整数段转成中文（不含节单位）。 */
function sectionToChinese(n: number): string {
  let result = '';
  let zeroPending = false;
  for (let pos = 3; pos >= 0; pos--) {
    const digit = Math.floor(n / 10 ** pos) % 10;
    if (digit === 0) {
      if (result) zeroPending = true;
    } else {
      if (zeroPending) { result += '零'; zeroPending = false; }
      result += DIGITS[digit] + INT_UNITS[pos];
    }
  }
  return result;
}

/** 整数部分转中文大写。 */
function integerToChinese(intPart: number): string {
  if (intPart === 0) return '零';
  const sections: number[] = [];
  let remaining = intPart;
  while (remaining > 0) {
    sections.unshift(remaining % 10000);
    remaining = Math.floor(remaining / 10000);
  }
  let result = '';
  sections.forEach((section, index) => {
    const unit = SECTION_UNITS[sections.length - 1 - index] ?? '';
    if (section === 0) {
      if (result && !result.endsWith('零')) result += '零';
    } else {
      result += sectionToChinese(section) + unit;
    }
  });
  return result.replace(/零+$/, '');
}

/**
 * 数字金额 → 人民币中文大写。
 * @param amount 金额（非负），小数按四舍五入保留到分
 * @returns 中文大写金额字符串
 */
export function amountToChinese(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return '金额无效';
  const cents = Math.round(amount * 100);
  const yuan = Math.floor(cents / 100);
  const jiao = Math.floor((cents % 100) / 10);
  const fen = cents % 10;

  const integer = integerToChinese(yuan) + '元';
  if (jiao === 0 && fen === 0) return integer + '整';

  let decimals = '';
  if (jiao > 0) decimals += DIGITS[jiao] + '角';
  else if (yuan > 0 && fen > 0) decimals += '零';
  if (fen > 0) decimals += DIGITS[fen] + '分';
  return integer + decimals;
}
