// 해상도별 화면 맞춤(public/fit.js)이 화면 전체에 건 비율. getBoundingClientRect는 화면 픽셀을 주고 CSS 길이는
// 그 비율만큼 다시 커지므로, 잰 거리를 CSS(transform·변수)에 넣을 때는 이 값으로 나눈다. 맞춤이 없으면 1.
export function fitScale(): number {
  const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fit'));
  return value > 0 ? value : 1;
}
