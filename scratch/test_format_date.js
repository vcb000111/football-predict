const formatDate = (dateStr) => {
  try {
    if (!dateStr) return '';
    let normalizedStr = dateStr;
    if (typeof dateStr === 'string' && !dateStr.includes('T') && !dateStr.includes('Z')) {
      normalizedStr = dateStr.replace(' ', 'T') + 'Z';
    }
    const d = new Date(normalizedStr);
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  } catch (e) {
    return dateStr;
  }
};

console.log("Test with SQLite string '2026-06-13 13:42:53':");
console.log(formatDate('2026-06-13 13:42:53'));

console.log("Test with ISO string '2026-06-13T13:42:53.123Z':");
console.log(formatDate('2026-06-13T13:42:53.123Z'));
