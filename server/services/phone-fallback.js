export function getNearbyAreaCodes(areaCode) {
  const code = parseInt(areaCode, 10);
  return [String(code - 1), String(code + 1), String(code - 2)];
}
