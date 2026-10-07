/**
 * Smart customer paste parser.
 *
 * Paste anything like a WhatsApp / Amazon / Flipkart / courier address block and this pulls out
 * name, mobile, pincode, state, GSTIN, city and the remaining address line.
 * It is a best-guess helper: the form always stays editable, so wrong guesses are one tap to fix.
 */

export const GST_STATES: { name: string; code: string }[] = [
  { name: 'Jammu & Kashmir', code: '01' },
  { name: 'Himachal Pradesh', code: '02' },
  { name: 'Punjab', code: '03' },
  { name: 'Chandigarh', code: '04' },
  { name: 'Uttarakhand', code: '05' },
  { name: 'Haryana', code: '06' },
  { name: 'Delhi', code: '07' },
  { name: 'Rajasthan', code: '08' },
  { name: 'Uttar Pradesh', code: '09' },
  { name: 'Bihar', code: '10' },
  { name: 'Sikkim', code: '11' },
  { name: 'Arunachal Pradesh', code: '12' },
  { name: 'Nagaland', code: '13' },
  { name: 'Manipur', code: '14' },
  { name: 'Mizoram', code: '15' },
  { name: 'Tripura', code: '16' },
  { name: 'Meghalaya', code: '17' },
  { name: 'Assam', code: '18' },
  { name: 'West Bengal', code: '19' },
  { name: 'Jharkhand', code: '20' },
  { name: 'Odisha', code: '21' },
  { name: 'Chhattisgarh', code: '22' },
  { name: 'Madhya Pradesh', code: '23' },
  { name: 'Gujarat', code: '24' },
  { name: 'Dadra & Nagar Haveli and Daman & Diu', code: '26' },
  { name: 'Maharashtra', code: '27' },
  { name: 'Karnataka', code: '29' },
  { name: 'Goa', code: '30' },
  { name: 'Lakshadweep', code: '31' },
  { name: 'Kerala', code: '32' },
  { name: 'Tamil Nadu', code: '33' },
  { name: 'Puducherry', code: '34' },
  { name: 'Andaman & Nicobar Islands', code: '35' },
  { name: 'Telangana', code: '36' },
  { name: 'Andhra Pradesh', code: '37' },
  { name: 'Ladakh', code: '38' },
];

export function stateCodeFor(stateName: string): string {
  const clean = (stateName || '').trim().toLowerCase();
  const hit = GST_STATES.find(s => s.name.toLowerCase() === clean);
  return hit ? hit.code : '';
}

export function stateNameFromCode(code: string): string {
  const hit = GST_STATES.find(s => s.code === code);
  return hit ? hit.name : '';
}

/** Words people type for states, mapped to the official name. Longest first when matching. */
const STATE_ALIASES: Record<string, string> = {
  'jammu and kashmir': 'Jammu & Kashmir',
  'jammu & kashmir': 'Jammu & Kashmir',
  'j&k': 'Jammu & Kashmir',
  'himachal pradesh': 'Himachal Pradesh',
  'himachal': 'Himachal Pradesh',
  'punjab': 'Punjab',
  'chandigarh': 'Chandigarh',
  'uttarakhand': 'Uttarakhand',
  'uttaranchal': 'Uttarakhand',
  'haryana': 'Haryana',
  'delhi': 'Delhi',
  'new delhi': 'Delhi',
  'rajasthan': 'Rajasthan',
  'uttar pradesh': 'Uttar Pradesh',
  'bihar': 'Bihar',
  'sikkim': 'Sikkim',
  'arunachal pradesh': 'Arunachal Pradesh',
  'nagaland': 'Nagaland',
  'manipur': 'Manipur',
  'mizoram': 'Mizoram',
  'tripura': 'Tripura',
  'meghalaya': 'Meghalaya',
  'assam': 'Assam',
  'west bengal': 'West Bengal',
  'jharkhand': 'Jharkhand',
  'odisha': 'Odisha',
  'orissa': 'Odisha',
  'chhattisgarh': 'Chhattisgarh',
  'chattisgarh': 'Chhattisgarh',
  'madhya pradesh': 'Madhya Pradesh',
  'gujarat': 'Gujarat',
  'daman and diu': 'Dadra & Nagar Haveli and Daman & Diu',
  'maharashtra': 'Maharashtra',
  'karnataka': 'Karnataka',
  'goa': 'Goa',
  'lakshadweep': 'Lakshadweep',
  'kerala': 'Kerala',
  'tamil nadu': 'Tamil Nadu',
  'tamilnadu': 'Tamil Nadu',
  'puducherry': 'Puducherry',
  'pondicherry': 'Puducherry',
  'andaman and nicobar': 'Andaman & Nicobar Islands',
  'telangana': 'Telangana',
  'andhra pradesh': 'Andhra Pradesh',
  'ladakh': 'Ladakh',
};

const STATE_ALIAS_KEYS = Object.keys(STATE_ALIASES).sort((a, b) => b.length - a.length);

/** First digits of an Indian PIN code tell the state. A few 3-digit exceptions are checked first. */
export function stateFromPincode(pin: string): string {
  if (!/^\d{6}$/.test(pin)) return '';
  const p3 = parseInt(pin.slice(0, 3), 10);
  const p2 = parseInt(pin.slice(0, 2), 10);

  if (p3 === 403) return 'Goa';
  if (p3 === 605) return 'Puducherry';
  if (p3 === 682 && pin.startsWith('6826')) return 'Lakshadweep';
  if (p3 >= 744 && p3 <= 744) return 'Andaman & Nicobar Islands';
  if (p3 === 737) return 'Sikkim';
  if (p3 === 160) return 'Chandigarh';
  if (p3 >= 244 && p3 <= 263) return 'Uttarakhand';
  if (p3 >= 396 && p3 <= 396 && pin.startsWith('3962')) return 'Gujarat';
  if (p3 === 396 && (pin.startsWith('3962') || pin.startsWith('3963'))) return 'Dadra & Nagar Haveli and Daman & Diu';
  if (p3 >= 790 && p3 <= 792) return 'Arunachal Pradesh';
  if (p3 >= 793 && p3 <= 794) return 'Meghalaya';
  if (p3 >= 795 && p3 <= 795) return 'Manipur';
  if (p3 >= 796 && p3 <= 796) return 'Mizoram';
  if (p3 >= 797 && p3 <= 798) return 'Nagaland';
  if (p3 >= 799 && p3 <= 799) return 'Tripura';
  if (p3 >= 500 && p3 <= 509) return 'Telangana';

  if (p2 === 11) return 'Delhi';
  if (p2 >= 12 && p2 <= 13) return 'Haryana';
  if (p2 >= 14 && p2 <= 16) return 'Punjab';
  if (p2 === 17) return 'Himachal Pradesh';
  if (p2 >= 18 && p2 <= 19) return 'Jammu & Kashmir';
  if (p2 >= 20 && p2 <= 28) return 'Uttar Pradesh';
  if (p2 >= 30 && p2 <= 34) return 'Rajasthan';
  if (p2 >= 36 && p2 <= 39) return 'Gujarat';
  if (p2 >= 40 && p2 <= 44) return 'Maharashtra';
  if (p2 >= 45 && p2 <= 48) return 'Madhya Pradesh';
  if (p2 === 49) return 'Chhattisgarh';
  if (p2 >= 50 && p2 <= 53) return 'Andhra Pradesh';
  if (p2 >= 56 && p2 <= 59) return 'Karnataka';
  if (p2 >= 60 && p2 <= 64) return 'Tamil Nadu';
  if (p2 >= 67 && p2 <= 69) return 'Kerala';
  if (p2 >= 70 && p2 <= 74) return 'West Bengal';
  if (p2 >= 75 && p2 <= 77) return 'Odisha';
  if (p2 === 78) return 'Assam';
  if (p2 >= 80 && p2 <= 82) return 'Bihar';
  if (p2 >= 83 && p2 <= 85) return 'Jharkhand';
  return '';
}

export interface ParsedCustomer {
  name: string;
  phone: string;
  pincode: string;
  state: string;
  stateCode: string;
  city: string;
  addressLine: string;
  gstin: string;
  /** B2B when a GSTIN or a company-style name is found, otherwise B2C */
  type: 'B2B' | 'B2C';
  /** which fields were actually detected, for the green/amber chips in the UI */
  found: {
    name: boolean;
    phone: boolean;
    pincode: boolean;
    state: boolean;
    city: boolean;
    address: boolean;
    gstin: boolean;
  };
}

const GSTIN_RE = /\b(\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z])\b/i;
// Indian mobile: optional +91 / 91 / 0, then 10 digits starting 6-9, spaces or hyphens allowed inside.
const PHONE_RE = /(?<!\d)(?:\+?\s*91[\s-]*|0)?([6-9](?:[\s-]?\d){9})(?!\d)/;
const PIN_RE = /(?<!\d)([1-9]\d{2})[\s-]?(\d{3})(?!\d)/;
const COMPANY_RE =
  /\b(pvt|private|ltd|limited|llp|llc|enterprise|enterprises|traders|trading|motors|motor|tyres|tyre|tires|auto|automobiles|automobile|garage|works|agency|agencies|stores|store|sports|industries|corporation|corp|co\.|company|bros|brothers|sons|distributors|wheels|cycles|cycle|bike|bikes)\b/i;

const LABEL_PREFIX_RE =
  /^\s*(?:to|ship\s*to|deliver(?:y)?\s*to|bill\s*to|buyer|customer|consignee|from)\s*[:\-,]?\s*$/i;

function cleanSpaces(s: string): string {
  return s.replace(/[ \t]+/g, ' ').trim();
}

function stripEdgePunct(s: string): string {
  return s.replace(/^[\s,;:\-–|/.]+|[\s,;:\-–|/]+$/g, '').trim();
}

export function parseCustomerText(raw: string): ParsedCustomer {
  const result: ParsedCustomer = {
    name: '',
    phone: '',
    pincode: '',
    state: '',
    stateCode: '',
    city: '',
    addressLine: '',
    gstin: '',
    type: 'B2C',
    found: { name: false, phone: false, pincode: false, state: false, city: false, address: false, gstin: false },
  };

  if (!raw || !raw.trim()) return result;

  let text = raw.replace(/\r/g, '\n').replace(/\u00a0/g, ' ');

  // 1. Pull out labelled values first (Name: ..., Mobile: ..., Pincode: ...) so labels never leak into the address.
  const takeLabel = (labels: string[], allowCommas = false): string => {
    const valuePart = allowCommas ? '([^\\n]+)' : '([^\\n,;]+)';
    const re = new RegExp(`(?:^|\\n|,|;)\\s*(?:${labels.join('|')})\\s*[:=\\-]\\s*${valuePart}`, 'i');
    const m = text.match(re);
    if (!m) return '';
    text = text.replace(m[0], m[0].startsWith('\n') ? '\n' : ' ');
    return cleanSpaces(m[1]);
  };

  const labelledName = takeLabel(['name', 'customer name', 'customer', 'buyer', 'party', 'consignee', 'ship to', 'bill to', 'deliver to']);
  const labelledPhone = takeLabel(['mobile', 'mob', 'mobile no', 'mobile number', 'phone', 'ph', 'ph no', 'contact', 'contact no', 'whatsapp', 'tel', 'cell']);
  const labelledPin = takeLabel(['pincode', 'pin code', 'pin', 'zip', 'postal code']);
  const labelledCity = takeLabel(['city', 'town', 'district', 'dist']);
  const labelledState = takeLabel(['state']);
  const labelledAddr = takeLabel(['delivery address', 'shipping address', 'address', 'addr'], true);
  if (labelledAddr) text += '\n' + labelledAddr;

  // 2. GSTIN
  const gstMatch = text.match(GSTIN_RE);
  if (gstMatch) {
    result.gstin = gstMatch[1].toUpperCase();
    result.found.gstin = true;
    text = text.replace(gstMatch[0], ' ');
    text = text.replace(/\b(?:gstin|gst\s*no|gst|uin)\s*[:=\-]?\s*/gi, ' ');
  }

  // 3. Mobile (do this BEFORE pincode so the 10 digits never get mistaken for a pincode)
  // Collect every number that looks like a mobile; prefer bare / +91 numbers over 0-prefixed (landline style) ones.
  const phoneCandidates: { digits: string; zeroPrefixed: boolean }[] = [];
  const phoneRe = new RegExp(PHONE_RE.source, 'g');
  const scanText = (labelledPhone ? labelledPhone + '\n' : '') + text;
  let pm: RegExpExecArray | null;
  while ((pm = phoneRe.exec(scanText)) !== null) {
    const full = pm[0].trim();
    phoneCandidates.push({ digits: pm[1].replace(/\D/g, ''), zeroPrefixed: /^0/.test(full) && !/^\+?\s*91/.test(full) });
  }
  text = text.replace(new RegExp(PHONE_RE.source, 'g'), ' ');
  if (phoneCandidates.length > 0) {
    const best = phoneCandidates.find(c => !c.zeroPrefixed) || phoneCandidates[0];
    result.phone = best.digits;
  }
  result.found.phone = result.phone.length === 10;
  // remove leftover phone labels (Ph, Mob, Contact...) with no number after them
  text = text.replace(/\b(?:mobile|mob|phone|ph|contact|whatsapp|tel|cell|call)\s*(?:no\.?|number)?\s*[:=\-]?\s*(?=[,\n]|$)/gi, ' ');

  // 4. Pincode
  if (labelledPin && /^\d{6}$/.test(labelledPin.replace(/\s/g, ''))) {
    result.pincode = labelledPin.replace(/\s/g, '');
  } else {
    const pinMatch = text.match(PIN_RE);
    if (pinMatch) {
      result.pincode = pinMatch[1] + pinMatch[2];
      text = text.replace(pinMatch[0], ' ');
    }
  }
  result.found.pincode = result.pincode.length === 6;
  text = text.replace(/\b(?:pincode|pin\s*code|pin|zip|postal\s*code)\s*[:=\-]?\s*(?=[,\n]|$)/gi, ' ');

  // 5. State: GSTIN prefix > written name > pincode prefix
  const stateFromGstin = result.gstin ? stateNameFromCode(result.gstin.slice(0, 2)) : '';
  let writtenState = '';
  const lowerText = text.toLowerCase();
  const stateSource = (labelledState || '').toLowerCase();
  if (stateSource) {
    const k = STATE_ALIAS_KEYS.find(key => stateSource.includes(key));
    if (k) writtenState = STATE_ALIASES[k];
  }
  if (!writtenState) {
    for (const key of STATE_ALIAS_KEYS) {
      const re = new RegExp(`(?:^|[^a-z])${key.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&')}(?:$|[^a-z])`, 'i');
      if (re.test(lowerText)) {
        writtenState = STATE_ALIASES[key];
        // remove it from the address text
        text = text.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&'), 'i'), ' ');
        break;
      }
    }
  }
  const stateFromPin = stateFromPincode(result.pincode);
  result.state = stateFromGstin || writtenState || stateFromPin;
  result.stateCode = stateCodeFor(result.state);
  result.found.state = !!result.state;

  text = text.replace(/\bindia\b/gi, ' ');

  // 6. Split what is left into clean segments (lines first, then commas)
  const lines = text
    .split('\n')
    .map(l => stripEdgePunct(cleanSpaces(l)))
    .filter(l => l.length > 0 && !LABEL_PREFIX_RE.test(l));

  // 7. Name
  const looksLikeName = (s: string) => {
    if (!s) return false;
    if (/\d/.test(s)) return false;
    if (s.length < 2 || s.length > 60) return false;
    if (s.split(' ').length > 7) return false;
    if (/\b(road|rd|street|st|nagar|colony|society|apartment|flat|plot|near|opp|opposite|behind|market|chowk|gali|lane|village|post|tal|taluka|dist|district|sector|phase|block|floor|building|bldg|complex|tower|towers|park|circle|cross|main|layout|extension|ext)\b/i.test(s)) return false;
    return true;
  };

  let name = labelledName;
  const segments: string[] = [];
  lines.forEach(line => {
    line
      .split(',')
      .map(s => stripEdgePunct(cleanSpaces(s)))
      .filter(Boolean)
      .forEach(s => segments.push(s));
  });

  if (!name) {
    // Prefer first line when pasted over multiple lines; otherwise first comma segment
    const firstLine = lines[0] ? lines[0].split(',')[0] : '';
    const candidates = [firstLine, segments[0]].filter(Boolean) as string[];
    const hit = candidates.find(looksLikeName);
    if (hit) {
      name = hit;
      const idx = segments.indexOf(hit);
      if (idx >= 0) segments.splice(idx, 1);
    }
  } else {
    const idx = segments.findIndex(s => s.toLowerCase() === name.toLowerCase());
    if (idx >= 0) segments.splice(idx, 1);
  }
  result.name = stripEdgePunct(name).replace(/\s+/g, ' ');
  result.found.name = !!result.name;

  // 8. City: labelled, else last remaining segment when something other than the street part is there
  let city = labelledCity;
  if (!city && segments.length >= 2) {
    const last = segments[segments.length - 1];
    if (!/\d/.test(last) && last.split(' ').length <= 3) {
      city = last;
      segments.pop();
    }
  } else if (city) {
    const idx = segments.findIndex(s => s.toLowerCase() === city.toLowerCase());
    if (idx >= 0) segments.splice(idx, 1);
  }
  result.city = stripEdgePunct(city);
  result.found.city = !!result.city;

  result.addressLine = segments.join(', ');
  result.found.address = !!result.addressLine;

  result.type = result.gstin || COMPANY_RE.test(result.name) ? 'B2B' : 'B2C';

  return result;
}

/** Quick check used by the UI to warn on obviously wrong mobile numbers. */
export function isValidIndianMobile(phone: string): boolean {
  return /^[6-9]\d{9}$/.test((phone || '').replace(/\D/g, '').slice(-10));
}
