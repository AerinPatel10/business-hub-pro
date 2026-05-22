// GSTIN utilities — format validation, checksum, and deterministic auto-fill
// (state name + state code + PAN are all derivable from a valid GSTIN, no API needed)

export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

// Indian state codes (first 2 digits of GSTIN)
export const STATE_CODES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "25": "Daman and Diu",
  "26": "Dadra and Nagar Haveli",
  "27": "Maharashtra",
  "28": "Andhra Pradesh (Old)",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
  "99": "Centre Jurisdiction",
};

// GSTIN checksum: characters 0-35 = 0-9, A-Z. Weights alternate 1,2.
const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export const verifyGstinChecksum = (gstin: string): boolean => {
  if (gstin.length !== 15) return false;
  const factor = 36;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const code = CHARS.indexOf(gstin[i]);
    if (code === -1) return false;
    const weight = i % 2 === 0 ? 1 : 2;
    const product = code * weight;
    sum += Math.floor(product / factor) + (product % factor);
  }
  const checkCode = (factor - (sum % factor)) % factor;
  return CHARS[checkCode] === gstin[14];
};

export interface GstinInfo {
  valid: boolean;
  reason?: string;
  stateCode?: string;
  state?: string;
  pan?: string;
}

export const parseGstin = (raw: string): GstinInfo => {
  const gstin = (raw || "").trim().toUpperCase();
  if (!gstin) return { valid: false, reason: "Empty" };
  if (gstin.length !== 15) return { valid: false, reason: "GSTIN must be 15 characters" };
  if (!GSTIN_REGEX.test(gstin)) return { valid: false, reason: "Invalid GSTIN format" };

  const stateCode = gstin.slice(0, 2);
  const state = STATE_CODES[stateCode];
  if (!state) return { valid: false, reason: "Unknown state code" };

  if (!verifyGstinChecksum(gstin)) return { valid: false, reason: "Invalid GSTIN checksum" };

  const pan = gstin.slice(2, 12);
  return { valid: true, stateCode, state, pan };
};
