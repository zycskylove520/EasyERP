import { amountToChinese } from '../src/common/amount-to-chinese';

describe('人民币大写金额工具', () => {
  const cases: Array<[number, string]> = [
    [0, '零元整'],
    [0.05, '零元伍分'],
    [0.1, '零元壹角'],
    [1, '壹元整'],
    [10, '壹拾元整'],
    [100, '壹佰元整'],
    [950, '玖佰伍拾元整'],
    [1000, '壹仟元整'],
    [1001, '壹仟零壹元整'],
    [10000, '壹万元整'],
    [17010.05, '壹万柒仟零壹拾元零伍分'],
    [100000, '壹拾万元整'],
    [1000000, '壹佰万元整'],
    [100000000, '壹亿元整'],
    [1234.56, '壹仟贰佰叁拾肆元伍角陆分'],
  ];

  it.each(cases)('%f → %s', (amount, expected) => {
    expect(amountToChinese(amount)).toBe(expected);
  });

  it('非法金额返回提示', () => {
    expect(amountToChinese(-1)).toBe('金额无效');
    expect(amountToChinese(Number.NaN)).toBe('金额无效');
  });
});
