export function calculateChecksum(obj: any): string {
  const sortedStr = JSON.stringify(sortObject(obj));
  let hash = 0;
  for (let i = 0; i < sortedStr.length; i++) {
    const char = sortedStr.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return hash.toString(36);
}

function sortObject(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortObject);
  return Object.keys(obj).sort().reduce((acc: any, key) => {
    acc[key] = sortObject(obj[key]);
    return acc;
  }, {});
}
