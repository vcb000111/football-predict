export function getVNTime(dateStr, timeStr, venueStr) {
  if (!dateStr || !timeStr) return { date: dateStr, time: timeStr, formatted: '' };

  // Mặc định là UTC-6 (Mexico City) -> lệch 13 tiếng (VN đi trước 13 tiếng) -> +780 phút
  let diffMinutes = 13 * 60; 
  const venue = (venueStr || '').toLowerCase();

  if (venue.includes('mexico city') || venue.includes('guadalajara') || venue.includes('azteca') || venue.includes('akron') || venue.includes('guadalajara')) {
    diffMinutes = 13 * 60;
  } else if (venue.includes('monterrey') || venue.includes('bbva')) {
    diffMinutes = 13 * 60;
  } else if (venue.includes('toronto') || venue.includes('bmo field') || venue.includes('atlanta') || venue.includes('mercedes-benz') || venue.includes('boston') || venue.includes('gillette') || venue.includes('miami') || venue.includes('hard rock') || venue.includes('new york') || venue.includes('metlife') || venue.includes('philadelphia') || venue.includes('lincoln financial')) {
    diffMinutes = 11 * 60; // Eastern Daylight Time (UTC-4) -> VN (UTC+7) -> lệch 11 tiếng
  } else if (venue.includes('dallas') || venue.includes('at&t') || venue.includes('houston') || venue.includes('nrg') || venue.includes('kansas') || venue.includes('arrowhead')) {
    diffMinutes = 12 * 60; // Central Daylight Time (UTC-5) -> VN (UTC+7) -> lệch 12 tiếng
  } else if (venue.includes('vancouver') || venue.includes('bc place') || venue.includes('los angeles') || venue.includes('sofi') || venue.includes('san francisco') || venue.includes('levi\'s') || venue.includes('seattle') || venue.includes('lumen')) {
    diffMinutes = 14 * 60; // Pacific Daylight Time (UTC-7) -> VN (UTC+7) -> lệch 14 tiếng
  } else if (venue.includes('istanbul') || venue.includes('turkey')) {
    diffMinutes = 4 * 60; // Turkey (UTC+3) -> VN (UTC+7) -> lệch 4 tiếng
  } else if (venue.includes('oslo') || venue.includes('norway') || venue.includes('rijeka') || venue.includes('croatia') || venue.includes('luxembourg') || venue.includes('rotterdam') || venue.includes('netherlands') || venue.includes('warsaw') || venue.includes('poland') || venue.includes('copenhagen') || venue.includes('denmark') || venue.includes('paris') || venue.includes('saint-denis') || venue.includes('france') || venue.includes('madrid') || venue.includes('spain') || venue.includes('solna') || venue.includes('sweden')) {
    diffMinutes = 5 * 60; // Western/Central Europe (UTC+2) -> VN (UTC+7) -> lệch 5 tiếng
  } else if (venue.includes('cardiff') || venue.includes('wales') || venue.includes('london')) {
    diffMinutes = 6 * 60; // UK (UTC+1) -> VN (UTC+7) -> lệch 6 tiếng
  }

  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hour, minute] = timeStr.split(':').map(Number);
    
    // Tạo date thô ở dạng UTC
    const baseDate = new Date(Date.UTC(year, month - 1, day, hour, minute));
    
    // Cộng chênh lệch
    const vnDate = new Date(baseDate.getTime() + diffMinutes * 60 * 1000);
    
    const vnYear = vnDate.getUTCFullYear();
    const vnMonth = String(vnDate.getUTCMonth() + 1).padStart(2, '0');
    const vnDay = String(vnDate.getUTCDate()).padStart(2, '0');
    const vnHour = String(vnDate.getUTCHours()).padStart(2, '0');
    const vnMinute = String(vnDate.getUTCMinutes()).padStart(2, '0');
    
    return {
      date: `${vnYear}-${vnMonth}-${vnDay}`,
      time: `${vnHour}:${vnMinute}`,
      formatted: `${vnHour}:${vnMinute} ${vnDay}/${vnMonth}`
    };
  } catch (e) {
    return { date: dateStr, time: timeStr, formatted: `${timeStr} ${dateStr}` };
  }
}
