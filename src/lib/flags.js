import React from 'react';

export const countryCodes = {
  // UEFA (Châu Âu)
  "Albania": "al", "Andorra": "ad", "Armenia": "am", "Austria": "at", "Azerbaijan": "az",
  "Belarus": "by", "Belgium": "be", "Bosnia and Herzegovina": "ba", "Bulgaria": "bg",
  "Croatia": "hr", "Cyprus": "cy", "Czechia": "cz", "Denmark": "dk", "England": "gb-eng",
  "Estonia": "ee", "Finland": "fi", "France": "fr", "Georgia": "ge", "Germany": "de",
  "Gibraltar": "gi", "Greece": "gr", "Hungary": "hu", "Iceland": "is", "Ireland": "ie",
  "Israel": "il", "Italy": "it", "Kazakhstan": "kz", "Kosovo": "xk", "Latvia": "lv",
  "Liechtenstein": "li", "Lithuania": "lt", "Luxembourg": "lu", "Malta": "mt", "Moldova": "md",
  "Montenegro": "me", "Netherlands": "nl", "North Macedonia": "mk", "Northern Ireland": "gb-nir",
  "Norway": "no", "Poland": "pl", "Portugal": "pt", "Romania": "ro", "Russia": "ru",
  "San Marino": "sm", "Scotland": "gb-sct", "Serbia": "rs", "Slovakia": "sk", "Slovenia": "si",
  "Spain": "es", "Sweden": "se", "Switzerland": "ch", "Turkey": "tr", "Türkiye": "tr",
  "Ukraine": "ua", "Wales": "gb-wls",

  // CONMEBOL (Nam Mỹ)
  "Argentina": "ar", "Bolivia": "bo", "Brazil": "br", "Chile": "cl", "Colombia": "co",
  "Ecuador": "ec", "Paraguay": "py", "Peru": "pe", "Uruguay": "uy", "Venezuela": "ve",

  // CONCACAF (Bắc Trung Mỹ & Caribe)
  "Canada": "ca", "Costa Rica": "cr", "Cuba": "cu", "Curaçao": "cw", "El Salvador": "sv",
  "Guatemala": "gt", "Haiti": "ht", "Honduras": "hn", "Jamaica": "jm", "Mexico": "mx",
  "Panama": "pa", "USA": "us", "United States": "us", "Trinidad and Tobago": "tt",

  // AFC (Châu Á)
  "Afghanistan": "af", "Australia": "au", "Bahrain": "bh", "Bangladesh": "bd", "Cambodia": "kh",
  "China": "cn", "Guam": "gu", "Hong Kong": "hk", "India": "in", "Indonesia": "id",
  "Iran": "ir", "Iraq": "iq", "Japan": "jp", "Jordan": "jo", "Kuwait": "kw", "Kyrgyzstan": "kg",
  "Lebanon": "lb", "Macau": "mo", "Malaysia": "my", "Maldives": "mv", "Mongolia": "mn",
  "Myanmar": "mm", "Nepal": "np", "North Korea": "kp", "Oman": "om", "Pakistan": "pk",
  "Palestine": "ps", "Philippines": "ph", "Qatar": "qa", "Saudi Arabia": "sa", "Singapore": "sg",
  "South Korea": "kr", "Sri Lanka": "lk", "Syria": "sy", "Taiwan": "tw", "Tajikistan": "tj",
  "Thailand": "th", "Timor-Leste": "tl", "Turkmenistan": "tm", "UAE": "ae", "Uzbekistan": "uz",
  "Vietnam": "vn", "Yemen": "ye",

  // CAF (Châu Phi)
  "Algeria": "dz", "Angola": "ao", "Benin": "bj", "Botswana": "bw", "Burkina Faso": "bf",
  "Burundi": "bi", "Cameroon": "cm", "Cape Verde": "cv", "Central African Republic": "cf",
  "Chad": "td", "Comoros": "km", "Congo": "cg", "DR Congo": "cd", "Djibouti": "dj",
  "Egypt": "eg", "Equatorial Guinea": "gq", "Eritrea": "er", "Eswatini": "sz", "Ethiopia": "et",
  "Gabon": "ga", "Gambia": "gm", "Ghana": "gh", "Guinea": "gn", "Guinea-Bissau": "gw",
  "Ivory Coast": "ci", "Kenya": "ke", "Lesotho": "ls", "Liberia": "lr", "Libya": "ly", "Madagascar": "mg",
  "Malawi": "mw", "Mali": "ml", "Mauritania": "mr", "Mauritius": "mu", "Morocco": "ma",
  "Mozambique": "mz", "Namibia": "na", "Niger": "ne", "Nigeria": "ng", "Rwanda": "rw",
  "Senegal": "sn", "Seychelles": "sc", "Sierra Leone": "sl", "Somalia": "so", "South Africa": "za",
  "South Sudan": "ss", "Sudan": "sd", "Tanzania": "tz", "Togo": "tg", "Tunisia": "tn",
  "Uganda": "ug", "Zambia": "zm", "Zimbabwe": "zw",

  // OFC (Châu Đại Dương)
  "Fiji": "fj", "New Caledonia": "nc", "New Zealand": "nz", "Papua New Guinea": "pg",
  "Samoa": "ws", "Solomon Islands": "sb", "Tahiti": "pf", "Tonga": "to", "Vanuatu": "vu"
};

export function getTeamFlagEmoji(teamName) {
  const flags = {
    // UEFA
    "Albania": "🇦🇱", "Andorra": "🇦🇩", "Armenia": "🇦🇲", "Austria": "🇦🇹", "Azerbaijan": "🇦🇿",
    "Belarus": "🇧🇾", "Belgium": "🇧🇪", "Bosnia and Herzegovina": "🇧🇦", "Bulgaria": "🇧🇬",
    "Croatia": "🇭🇷", "Cyprus": "🇨🇾", "Czechia": "🇨🇿", "Denmark": "🇩🇰", "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    "Estonia": "🇪🇪", "Finland": "🇫🇮", "France": "🇫🇷", "Georgia": "🇬🇪", "Germany": "🇩🇪",
    "Gibraltar": "🇬🇮", "Greece": "🇬🇷", "Hungary": "🇭🇺", "Iceland": "🇮🇸", "Ireland": "🇮🇪",
    "Israel": "🇮🇱", "Italy": "🇮🇹", "Kazakhstan": "🇰🇿", "Kosovo": "🇽🇰", "Latvia": "🇱🇻",
    "Liechtenstein": "🇱🇮", "Lithuania": "🇱🇹", "Luxembourg": "🇱🇺", "Malta": "🇲🇹", "Moldova": "🇲🇩",
    "Montenegro": "🇲🇪", "Netherlands": "🇳🇱", "North Macedonia": "🇲🇰", "Northern Ireland": "🇬🇧",
    "Norway": "🇳🇴", "Poland": "🇵🇱", "Portugal": "🇵🇹", "Romania": "🇷🇴", "Russia": "🇷🇺",
    "San Marino": "🇸🇲", "Scotland": "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "Serbia": "🇷🇸", "Slovakia": "🇸🇰", "Slovenia": "🇸🇮",
    "Spain": "🇪🇸", "Sweden": "🇸🇪", "Switzerland": "🇨🇭", "Turkey": "🇹🇷", "Türkiye": "🇹🇷",
    "Ukraine": "🇺🇦", "Wales": "🏴󠁧󠁢󠁷󠁬󠁳󠁿",

    // CONMEBOL
    "Argentina": "🇦🇷", "Bolivia": "🇧🇴", "Brazil": "🇧🇷", "Chile": "🇨🇱", "Colombia": "🇨🇴",
    "Ecuador": "🇪🇨", "Paraguay": "🇵🇾", "Peru": "🇵🇪", "Uruguay": "🇺🇾", "Venezuela": "🇻🇪",

    // CONCACAF
    "Canada": "🇨🇦", "Costa Rica": "🇨🇷", "Cuba": "🇨🇺", "Curaçao": "🇨🇼", "El Salvador": "🇸🇻",
    "Guatemala": "🇬🇹", "Haiti": "🇭🇹", "Honduras": "🇭🇳", "Jamaica": "🇯🇲", "Mexico": "🇲🇽",
    "Panama": "🇵🇦", "USA": "🇺🇸", "United States": "🇺🇸", "Trinidad and Tobago": "🇹🇹",

    // AFC
    "Afghanistan": "🇦🇫", "Australia": "🇦🇺", "Bahrain": "🇧🇭", "Bangladesh": "🇧🇩", "Cambodia": "🇰🇭",
    "China": "🇨🇳", "Guam": "🇬🇺", "Hong Kong": "🇭🇰", "India": "🇮🇳", "Indonesia": "🇮🇩",
    "Iran": "🇮🇷", "Iraq": "🇮🇶", "Japan": "🇯🇵", "Jordan": "🇯🇴", "Kuwait": "🇰🇼", "Kyrgyzstan": "🇰🇬",
    "Lebanon": "🇱🇧", "Macau": "🇲🇴", "Malaysia": "🇲🇾", "Maldives": "🇲🇻", "Mongolia": "🇲🇳",
    "Myanmar": "🇲🇲", "Nepal": "🇳🇵", "North Korea": "🇰🇵", "Oman": "🇴🇲", "Pakistan": "🇵🇰",
    "Palestine": "🇵🇸", "Philippines": "🇵🇭", "Qatar": "🇶🇦", "Saudi Arabia": "🇸🇦", "Singapore": "🇸🇬",
    "South Korea": "🇰🇷", "Sri Lanka": "🇱🇰", "Syria": "🇸🇾", "Taiwan": "🇹🇼", "Tajikistan": "🇹🇯",
    "Thailand": "🇹🇭", "Timor-Leste": "🇹🇱", "Turkmenistan": "🇹🇲", "UAE": "🇦🇪", "Uzbekistan": "🇺🇿",
    "Vietnam": "🇻🇳", "Yemen": "🇾🇪",

    // CAF
    "Algeria": "🇩🇿", "Angola": "🇦🇴", "Benin": "🇧🇯", "Botswana": "🇧🇼", "Burkina Faso": "🇧🇫",
    "Burundi": "🇧🇮", "Cameroon": "🇨🇲", "Cape Verde": "🇨🇻", "Central African Republic": "🇨🇫",
    "Chad": "🇹🇩", "Comoros": "🇰🇲", "Congo": "🇨🇬", "DR Congo": "🇨🇩", "Djibouti": "🇩🇯",
    "Egypt": "🇪🇬", "Equatorial Guinea": "gq", "Eritrea": "🇪🇷", "Eswatini": "🇸🇿", "Ethiopia": "🇪🇹",
    "Gabon": "🇬🇦", "Gambia": "🇬🇲", "Ghana": "🇬🇭", "Guinea": "🇬🇳", "Guinea-Bissau": "🇬🇼",
    "Ivory Coast": "🇨🇮", "Kenya": "🇰🇪", "Lesotho": "🇱🇸", "Liberia": "🇱🇷", "Libya": "🇱🇾", "Madagascar": "🇲🇬",
    "Malawi": "🇲🇼", "Mali": "🇲🇱", "Mauritania": "🇲🇷", "Mauritius": "🇲🇺", "Morocco": "🇲🇦",
    "Mozambique": "🇲🇿", "Namibia": "🇳🇦", "Niger": "🇳🇪", "Nigeria": "🇳🇬", "Rwanda": "🇷🇼",
    "Senegal": "🇸🇳", "Seychelles": "🇸🇨", "Sierra Leone": "🇸🇱", "Somalia": "🇸🇴", "South Africa": "🇿🇦",
    "South Sudan": "🇸🇸", "Sudan": "🇸🇩", "Tanzania": "🇹🇿", "Togo": "🇹🇬", "Tunisia": "🇹🇳",
    "Uganda": "🇺🇬", "Zambia": "🇿🇲", "Zimbabwe": "🇿🇼",

    // OFC
    "Fiji": "🇫🇯", "New Caledonia": "🇳🇨", "New Zealand": "🇳🇿", "Papua New Guinea": "🇵🇬",
    "Samoa": "🇼🇸", "Solomon Islands": "🇸🇧", "Tahiti": "🇵🇫", "Tonga": "🇹🇴", "Vanuatu": "🇻🇺"
  };
  return flags[teamName] || "🏳️";
}

export function getTeamFlag(teamName, className = "w-6 h-4.5") {
  const code = countryCodes[teamName];
  if (!code) return <span className="inline-block text-xl">🏳️</span>;
  return (
    <img 
      src={`https://flagcdn.com/w40/${code}.png`} 
      alt={teamName}
      className={`inline-block object-cover rounded-sm shadow-sm border border-card-border/60 ${className}`}
      loading="lazy"
    />
  );
}
