export const cleanNamePrefix = (name: string): string => {
  if (!name) return name;
  
  // List of common Thai and English prefixes to remove
  const prefixes = [
    'ด.ช.', 'ด.ญ.', 'เด็กชาย', 'เด็กหญิง', 'นาย', 'นางสาว', 'นาง',
    'mr.', 'mrs.', 'ms.', 'miss', 'master'
  ];
  
  let cleanedName = name.trim();
  let lowerName = cleanedName.toLowerCase();
  
  for (const prefix of prefixes) {
    if (lowerName.startsWith(prefix)) {
      // Remove the prefix
      cleanedName = cleanedName.substring(prefix.length).trim();
      lowerName = cleanedName.toLowerCase();
    }
  }
  
  return cleanedName;
};
